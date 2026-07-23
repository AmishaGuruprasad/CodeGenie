from langchain_mistralai import ChatMistralAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from .LLMProvider import LLMProvider
from config.settings import Settings
class MistralProvider(LLMProvider):
    
    def __init__(self):

        self.llm = ChatMistralAI(
            model = Settings.MISTRAL_MODEL,
            api_key = Settings.MISTRAL_API_KEY,
            temperature = 0
        )

        self.prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "You are a helpful coding assistant"),
                ("placeholder", '{history}'),
                ("human", "{question}")
            ]

        )

    async def stream_response(self, prompt : str, messages : list = []):

        history = []

        for m in messages:
            history.append(HumanMessage(content = m['user']))
            history.append(AIMessage(content = m['bot']))

        prompt = self.prompt.invoke({
            "question" : prompt,
            "history" : history
        })

        async for chunk in self.llm.astream(prompt):
            if chunk.content: 
                yield chunk.content



