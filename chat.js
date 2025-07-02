const vscode = acquireVsCodeApi();

const input = document.getElementById("input-txt-box");
const sendButton = document.getElementById("send-button");
const responseArea = document.getElementById("response-area");
const chatList = document.getElementById("chat-list");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const sidebar = document.getElementById("sidebar");
const addChat = document.getElementById("new-chat-btn");
const toggleContextBtn = document.getElementById('toggle-context-btn');
const contextDiv = document.getElementById('context-files');

toggleContextBtn.addEventListener('click', () => {
  const visible = contextDiv.style.display === 'flex' || contextDiv.style.display === 'block';
  contextDiv.style.display = visible ? 'none' : 'flex';
  toggleContextBtn.textContent = visible ? '📂 Show Context Files' : '📂 Hide Context Files';
});

const api_root = `http://192.168.23.97:8000/`

let fileContextMap = {};

let userId=""; 



function addMessage(text, sender = 'user') {
  const messageElem = document.createElement('div');
  messageElem.classList.add('chat-message');
  messageElem.classList.add(sender === 'user' ? 'user-message' : 'bot-message');

  if (sender === 'bot') {
    const html = marked.parse(text); //converts text to html content
    console.log("hi");
    messageElem.innerHTML = html;
    renderResponse(messageElem);
  } else {
    messageElem.textContent = text;
  }

  responseArea.appendChild(messageElem);
  responseArea.scrollTop = responseArea.scrollHeight;
}

async function sendMessage(message) {
  let context = '';
  if (fileContextMap && Object.keys(fileContextMap).length > 0) {
    for (let fileId in fileContextMap) {
      let file = fileContextMap[fileId];
      if (file.enabled) {
        context += `\n\nContext from file "${file.name}":\n${file.content}\n\n`;
      }
    };
  }
  let promptWithContext = context + message;

  addMessage(message, 'user');
  const botMessageElem = document.createElement('div');
  botMessageElem.classList.add('chat-message', 'bot-message');
  responseArea.appendChild(botMessageElem);
  responseArea.scrollTop = responseArea.scrollHeight;

  const old_chat = document.getElementsByClassName("selected")[0];
  let chatid;
  let req_body;
  if (old_chat) {
    chatid = old_chat.getAttribute("id");
    req_body = {
      chat_id: chatid,
      prompt: promptWithContext
    };
  }
  else {
    chatid = Date.now();
    req_body = {
      chat_id: chatid,
      prompt: promptWithContext,
      chat_title: generateChatTitle(message)
    };
  }

  try {
    let response = await fetch(`${api_root}chat`, {  
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-User-Id':`${userId}`
      },
      body: JSON.stringify(req_body),
    });
    if (response.status === 404) {
      botMessageElem.textContent = 'Chat not found. Please create a new chat.';
      return;
    }
    if (!response.ok) throw new Error('Network response was not ok');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let botText = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      botText += decoder.decode(value, { stream: true });
      botMessageElem.innerHTML = marked.parse(botText);
      responseArea.scrollTop = responseArea.scrollHeight;
    }
    renderResponse(botMessageElem);
    addSidebarElement(chatid, message);
    document.getElementById(chatid).classList.add("selected");

  } catch (error) {
    botMessageElem.textContent = 'Error: ' + error.message;
  }
}

function generateChatTitle(prompt, numKeywords = 10) {
  const text = prompt.toLowerCase().replace(/[^\w\s]/g, '');
  const stopWords = new Set(['the', 'what', 'write', 'is', 'and', 'a', 'an', 'in', 'on', 'with', 'for', 'this', 'give', 'generate']);
  const words = text.split(/\s+/).filter(word => !stopWords.has(word) && word !== '');
  const freqMap = {};
  for (const word of words) {
    freqMap[word] = (freqMap[word] || 0) + 1;
  }
  const mostCommon = Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, numKeywords)
    .map(([word]) => word);
  const summarizedText = mostCommon.join(' ');
  const result = summarizedText.charAt(0).toUpperCase() + summarizedText.slice(1);
  return result;
}

function renderResponse(botMessageElem) {
  const codeBlocks = botMessageElem.querySelectorAll('pre > code');
    codeBlocks.forEach(code => {
      const pre = code.parentElement;
      const wrapper = document.createElement('div');
      wrapper.classList.add('code-wrapper');
      pre.replaceWith(wrapper);
      wrapper.appendChild(pre);
      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋';
      copyBtn.classList.add('copy-button-inline');
      copyBtn.title = 'Copy code';

      copyBtn.onclick = () => {
        navigator.clipboard.writeText(code.textContent).then(() => {
          copyBtn.textContent = '✅';
          setTimeout(() => (copyBtn.textContent = '📋'), 1500);
        });
      };

      wrapper.appendChild(copyBtn);
    });
}

sendButton.addEventListener("click", () => {
  const message = input.value.trim();
  if (message) {
    sendMessage(message);
    input.value = '';
  }
});

input.addEventListener('keydown', function (event) {
  if (event.key === 'Enter') {
    if (event.shiftKey) {
      input.value += "\n";
    }
    else {
      sendButton.click();
    }
    event.preventDefault();
  }
});

toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("sidebar-hidden");
});

async function deleteChat(chatId) {
  try {
    const response = await fetch(`${api_root}chat/${chatId}`, {
      method: 'DELETE',
      headers: { 
        'X-User-Id':`${userId}`
      },
    });
    if (!response.ok) throw new Error('Failed to delete chat');

    const del_li = document.getElementById(chatId);
    if (del_li.classList.contains("selected")) {
      addChat.click()
    }
    del_li.remove();
  } catch (error) {
    addMessage('Error deleting chat: ' + error.message, 'bot');
  }
}

function showRenameInput(li) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = li.children[0].textContent;
  input.classList.add("rename-input");

  const chatTitleElem = li.querySelector("span");
  li.replaceChild(input, chatTitleElem);
  input.focus();

  const save = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== li.children[0].textContent) {
      const response = await fetch(`${api_root}chat/${li.getAttribute("id")}`, {
        method: "PATCH",
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id':`${userId}`
         },
        body: JSON.stringify({ chat_title: newTitle }),
      });
      if (response.ok) {
        li.children[0].textContent = newTitle;
      } else {
        addMessage("Failed to rename chat", "bot"); //change
      }
    }
    chatTitleElem.textContent = newTitle;
    li.replaceChild(chatTitleElem, input);
  };

  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") li.replaceChild(chatTitleElem, input);
  });
}

function showMenuPopup(li) {
  const existing = document.querySelector(".popup-menu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.className = "popup-menu";

  const renameBtn = document.createElement("button");
  renameBtn.className = "popup-btn";
  renameBtn.innerHTML = `  
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="white" viewBox="0 0 16 16">
          <path d="M12.146.854a.5.5 0 0 1 .708 0l2.292 2.292a.5.5 0 0 1 0 
          .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 
          1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 
          2L2 11.207V13h1.793L14 3.793 11.207 
          2zM13.5 3.5L12.5 2.5 13 2l1 1-0.5.5z"/>
        </svg>
        Rename`; //icon and name
  
  renameBtn.onclick = (e) => {
    e.stopPropagation();
    menu.remove();
    showRenameInput(li);
  };

  const delBtn = document.createElement("button");
  delBtn.className = "popup-btn";
  delBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="white" viewBox="0 0 16 16">
          <path d="M5.5 5.5v6h1v-6h-1zm3 0v6h1v-6h-1z"/>
          <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 
          2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 1 1 
          0-2H5V1a1 1 0 0 1 1-1h4a1 1 0 0 1 1 
          1v1h2.5a1 1 0 0 1 1 1zM6 1v1h4V1H6z"/>
        </svg>
        Delete`; 
  
  delBtn.onclick = async (e) => {
    e.stopPropagation();
    menu.remove();
    await deleteChat(li.getAttribute("id"));
  };

  menu.appendChild(renameBtn);
  menu.appendChild(delBtn);
  li.appendChild(menu);

  document.addEventListener("click", function closePopup(event) {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener("click", closePopup);
    }
  });
}

function updateSidebarSelection(li) {
  const selectedChat = document.getElementsByClassName("selected")[0];
  if (selectedChat) {
    selectedChat.classList.remove("selected");
  }
  li.classList.add("selected");
}

async function loadChatHistory(chatId) {
  responseArea.innerHTML = "";
  try {
    const response = await fetch(`${api_root}chat/${chatId}`,{
      headers : {
        'X-User-Id':`${userId}`
      }
    });
    if (response.status === 404) {
      addMessage('No history found for this chat.', 'bot');
      return;
    }
    if (!response.ok) throw new Error('Failed to fetch chat history');
    const messages = await response.json();
    console.log(messages);
    if (messages){
      for (const message of messages) {
        addMessage(message.user, 'user');
        addMessage(message.bot, 'bot');
      }
    } else {
      console.log("No messages found") 
    }
  }
  //  catch (error) {
  //   addMessage('Error loading chat history: ' + error.message, 'bot');
  // }
  finally{}
  responseArea.scrollTop = responseArea.scrollHeight;
}

function addSidebarElement (chatid, title) {
  const li = document.createElement("li");
  li.classList.add("chat-item");
  li.setAttribute("id",chatid);

  const chatTitle = document.createElement("span");
  chatTitle.textContent = title;

  li.appendChild(chatTitle);

  li.addEventListener("click", () => {
    loadChatHistory(chatid);
    updateSidebarSelection(li);
  });

  const menuBtn = document.createElement("button");
  menuBtn.className = "chat-menu-btn";
  menuBtn.innerHTML = "⋮";
  menuBtn.title = "More Options";

  menuBtn.onclick = (e) => {
    e.stopPropagation();
    showMenuPopup(li);
  };

  li.appendChild(menuBtn);
  chatList.insertBefore(li,chatList.childNodes[0]);
} 

async function fetchChatList() {
  try {
    const response = await fetch(`${api_root}list-all-chats`,{
      headers : {
        'X-User-Id':`${userId}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch chat list');
    const allChats = await response.json();
    let chats = allChats; //list of chat objects 
    chats.forEach((chat) => {
      addSidebarElement(chat.chat_id,chat.chat_title);
    });
  } catch (error) {
    console.log("Error fetching chatList");
  }
}

window.onload = async () => {
  console.log("Hello from window.onload")
    // await fetchChatList();
    // loadContextFiles();  
};
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📦 DOM fully loaded");
  // await fetchChatList();
  // loadContextFiles();
});


addChat.addEventListener('click', async () => {
  responseArea.innerHTML = "";
  const selectedChat = document.getElementsByClassName("selected")[0];
  if (selectedChat) {
    selectedChat.classList.remove("selected");
  }
});

document.getElementById('attach-file-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'selectFile' });
});

async function generateFileId(fileContent) {
  const encoder = new TextEncoder();
  const data = encoder.encode(fileContent);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

async function messageEventHandler(message) {
  if (message.command === 'initContext') {  //this is for adding the current file to the context files
    // fileContextMap = {}; // Reset file context map
    let fileId = await generateFileId(message.currentFileContent);
    fileContextMap[fileId] = {
        name : message.currentFileName,
        content : message.currentFileContent,
        enabled : false
    };

    addFileUI(fileId);
  }

  if (message.type === 'fileContent') {
    let fileId = await generateFileId(message.content);
    console.log(fileContextMap);
    if (!(fileId in fileContextMap)) {
      console.log(fileContextMap);
      fileContextMap[fileId] = {name: message.name, content: message.content, enabled: true};
      saveContextFiles();
      addFileUI(fileId);
    }
  }

  if (message.type === 'userId'){
    userId = message.value;
    console.log(`************${userId}****************`)
  }
}


window.addEventListener('message', event => {
  const message = event.data;
  messageEventHandler(message);
});


function addFileUI(fileId){
  const file = fileContextMap[fileId];
  const fileElem = document.createElement('span');
  fileElem.className = 'context-file';
  fileElem.textContent = file.name;
  // fileElem.setAttribute("id", fileId);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = file.enabled;
  toggle.onchange = () => { file.enabled = toggle.checked; };
  fileElem.appendChild(toggle);

  const removeBtn = document.createElement('button');
  removeBtn.textContent = '✖';
  removeBtn.className = 'remove-context-file';

  removeBtn.onclick = () => {
    delete fileContextMap[fileId];
    fileElem.remove();
    saveContextFiles();
  };
  fileElem.appendChild(removeBtn);

  contextDiv.appendChild(fileElem);
}

function saveContextFiles() {
  vscode.setState({ fileContextMap: fileContextMap });  //find what this does and if its needed
}

function loadContextFiles() {
  const state = vscode.getState();
  window.fileContextMap = (state && state.fileContextMap) ? state.fileContextMap : {};
  for (let fileId in fileContextMap) {
    addFileUI(fileId);
  }
}









