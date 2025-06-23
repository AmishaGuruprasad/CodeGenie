from flask import Flask, request, jsonify, Response
from flask_restful import Api, Resource
from llama_cpp import Llama
from tinydb import TinyDB, Query
from datetime import datetime
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app)
api = Api(app)

llm = Llama(
    model_path="C:\\Users\\bhaar\\Desktop\\codegenie\\backend\\deepseek-coder-1.3b-instructQ6_K.gguf",
    n_ctx=1000,
    n_threads=6,
    n_gpu_layers=20
)

db = TinyDB("chat_history.json")
chat_table = db.table("chats")
Chat = Query()

# Fix chat titles at startup
for chat in chat_table.all():
    title = chat.get("title", "")
    messages = chat.get("messages", [])
    if (title == "New Chat" or title.startswith("Chat ")) and messages:
        chat_table.update({"title": messages[0]["user"]}, Chat.chat_id == chat["chat_id"])
        print(f"Updated chat {chat['chat_id']} title to: {messages[0]['user']}")

# Helper to build model prompt
def build_prompt(prompt, chat_id):
    chat = chat_table.get(Chat.chat_id == chat_id)
    model_prompt = "You are an AI assistant. Always answer ONLY in English.\n" if not chat or not chat.get("messages") else ""
    if chat and 'messages' in chat:
        for msg in chat['messages'][-3:]:
            model_prompt += f"<|user|>\n{msg['user']}\n<|assistant|>\n{msg['assistant']}\n"
    model_prompt += f"<|user|>\n{prompt}\n<|assistant|>\n"
    return model_prompt

class ChatSource(Resource):
    def get(self, chat_id):
        conversation = chat_table.get(Chat.chat_id == chat_id)
        if conversation:
            return {
                "messages": conversation.get("messages", []),
                "contextFiles": conversation.get("contextFiles", [])
            }
        return {"error": f"CHAT ID '{chat_id}' not found."}, 400

    def post(self, chat_id):
        data = request.get_json() or {}
        prompt = data.get('prompt', '').strip()
        context_files = data.get('contextFiles', [])  # list of dicts: [{name, content}, ...]
        title = data.get('title', 'New Chat')

        chat = chat_table.get(Chat.chat_id == chat_id)
        if not chat:
            print(f"[CodeGenie] Creating new chat in backend: {chat_id}")
            chat_table.insert({"chat_id": chat_id, "title": title, "messages": [], "contextFiles": context_files})
            if not prompt:
                print(f"[CodeGenie] New chat created successfully: {chat_id}")
                return {"message": "Chat created successfully."}, 201
        else:
            # Always update contextFiles if provided
            if context_files is not None:
                chat_table.update({"contextFiles": context_files}, Chat.chat_id == chat_id)

        if prompt:
            # Build prompt for model
            full_prompt = ""
            if context_files:
                for file in context_files:
                    full_prompt += f"\n# ===== File: {file['name']} =====\n{file['content']}\n"
            full_prompt += f"\n# ===== User Prompt =====\n{prompt}"

            def stream_and_save():
                model_prompt = build_prompt(full_prompt, chat_id)
                buffer = ""
                assistant_response = ""
                try:
                    for chunk in llm(model_prompt, max_tokens=256, stop=["<|user|>"], stream=True):
                        text = chunk['choices'][0]['text'].replace("<|user|>", "").replace("<|assistant|>", "")
                        buffer += text
                        assistant_response += text
                        if any(x in buffer for x in [" ", "\n", "."]) or len(buffer) > 10:
                            yield buffer
                            buffer = ""
                    if buffer:
                        yield buffer
                except Exception as e:
                    yield f"\n[Error: {str(e)}]"
                # Save the message to the chat history after streaming is done
                chat = chat_table.get(Chat.chat_id == chat_id)
                if chat:
                    messages = chat.get("messages", [])
                    messages.append({"user": prompt, "assistant": assistant_response})
                    chat_table.update({"messages": messages, "contextFiles": context_files}, Chat.chat_id == chat_id)

            return Response(stream_and_save(), mimetype='text/plain')

        return {"error": "Prompt is empty"}, 400

    def stream_code(self, prompt, chat_id):
        model_prompt = build_prompt(prompt, chat_id)
        buffer = ""
        last_yield = time.time()
        try:
            for chunk in llm(model_prompt, max_tokens=256, stop=["<|user|>"], stream=True):
                text = chunk['choices'][0]['text'].replace("<|user|>", "").replace("<|assistant|>", "")
                buffer += text
                if any(x in buffer for x in [" ", "\n", "."]) or len(buffer) > 10 or time.time() - last_yield > 0.1:
                    yield buffer
                    buffer = ""
                    last_yield = time.time()
            if buffer:
                yield buffer
        except Exception as e:
            yield f"\n[Error: {str(e)}]"

    def delete(self, chat_id):
        chat_table.remove(Chat.chat_id == chat_id)
        return chat_table.all()

    def patch(self, chat_id):
        data = request.get_json()
        title = data.get("title")
        user = data.get("user")
        assistant = data.get("assistant")
        context_files = data.get("contextFiles")
        updated = False

        if title:
            chat_table.update({"title": title}, Chat.chat_id == chat_id)
            updated = True

        if user is not None and assistant is not None:
            chat = chat_table.get(Chat.chat_id == chat_id)
            if chat:
                messages = chat.get("messages", [])
                messages.append({"user": user, "assistant": assistant})
                new_title = messages[0]["user"] if chat.get("title") == "New Chat" else chat["title"]
                chat_table.update({"messages": messages, "title": new_title}, Chat.chat_id == chat_id)
                updated = True

        if context_files is not None:
            chat_table.update({"contextFiles": context_files}, Chat.chat_id == chat_id)
            updated = True

        if updated:
            return {"message": "Update successful."}
        return {"error": "Nothing to update."}, 400

api.add_resource(ChatSource, "/chatsource/<int:chat_id>")

class ListAllChats(Resource):
    def get(self):
        all_chats = chat_table.all()
        return all_chats if all_chats else {"error": "No chats found."}, 400

    def delete(self):
        chat_table.truncate()
        print("[CodeGenie] All chats deleted.")
        return {"message": "All chats deleted."}, 200

api.add_resource(ListAllChats, "/list-all-chats")

class GetConversationHistory(Resource):
    def get(self, chat_id):
        conversation = chat_table.get(Chat.chat_id == chat_id)
        if conversation and "messages" in conversation:
            return conversation["messages"]
        return {"error": "No history found for this chat."}, 404

api.add_resource(GetConversationHistory, "/conversation-history/<int:chat_id>")

@app.route('/autocomplete', methods=['POST'])
def autocomplete():
    data = request.get_json()
    prompt = data.get('prompt', '')
    line_prefix = data.get('linePrefix', '')
    model_prompt = f"{prompt}\n{line_prefix}"
    print("=== Autocomplete called ===")
    print("Prompt sent to model:", repr(model_prompt))
    try:
        output = llm(model_prompt, max_tokens=16)
        suggestion = output['choices'][0]['text'].strip().split('\n')[0]
        print("Suggestion returned:", suggestion)
        return jsonify([suggestion])
    except Exception as e:
        print("Autocomplete error:", e)
        return jsonify([]), 500

if __name__ == "__main__":
    app.run(debug=True)
