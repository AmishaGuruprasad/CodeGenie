const vscode = acquireVsCodeApi();

const input = document.getElementById("input-txt-box");
const sendButton = document.getElementById("send-button");
const responseArea = document.getElementById("response-area");
const chatList = document.getElementById("chat-list");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const sidebar = document.getElementById("sidebar");
const addChat = document.getElementById("new-chat-btn");

let chats = [];
let currentChatIndex = -1;

async function fetchChatList() {
  try {
    const response = await fetch('http://localhost:5000/list-all-chats');
    if (!response.ok) throw new Error('Failed to fetch chat list');
    const allChats = await response.json();
    chats = allChats;
    renderChatList();
    updateSidebarSelection();
  } catch (error) {
    chats = [];
    renderChatList();
    addMessage('No chats found. Click "+" to start a new chat.', 'bot');
  }
}

async function loadChatHistory() {
  responseArea.innerHTML = "";
  if (currentChatIndex === -1 || !chats[currentChatIndex]) return;
  const chatId = chats[currentChatIndex].chat_id;
  try {
    const response = await fetch(`http://localhost:5000/conversation-history/${chatId}`);
    if (response.status === 404) {
      addMessage('No history found for this chat.', 'bot');
      return;
    }
    if (!response.ok) throw new Error('Failed to fetch chat history');
    const messages = await response.json();
    if (Array.isArray(messages)) {
      for (const message of messages) {
        addMessage(message.user, 'user');
        addMessage(message.assistant, 'bot');
      }
    } else {
      addMessage('No history found for this chat.', 'bot');
    }
  } catch (error) {
    addMessage('Error loading chat history: ' + error.message, 'bot');
  }
  responseArea.scrollTop = responseArea.scrollHeight;
}

function addMessage(text, sender = 'user') {
  const messageElem = document.createElement('div');
  messageElem.classList.add('chat-message');
  messageElem.classList.add(sender === 'user' ? 'user-message' : 'bot-message');

  if (sender === 'bot') {
    const html = marked.parse(text);
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = html;

    const codeBlocks = contentDiv.querySelectorAll('pre > code');
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

    messageElem.appendChild(contentDiv);
  } else {
    messageElem.textContent = text;
  }

  responseArea.appendChild(messageElem);
  responseArea.scrollTop = responseArea.scrollHeight;
}


async function sendMessage(message) {
  input.disabled = true;
  sendButton.disabled = true;
  sendButton.innerText = 'Generating...';

  let context = '';

  addMessage(message, 'user');

  if (currentChatIndex === -1 || !chats[currentChatIndex]) {
    addMessage('Please select or create a chat first.', 'bot');
    input.disabled = false;
    sendButton.disabled = false;
    sendButton.innerText = 'Send';
    return;
  }

  const chatId = chats[currentChatIndex].chat_id;
  const botMessageElem = document.createElement('div');
  botMessageElem.classList.add('chat-message', 'bot-message');
  responseArea.appendChild(botMessageElem);
  responseArea.scrollTop = responseArea.scrollHeight;

  try {
    const response = await fetch(`http://localhost:5000/chatsource/${chatId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: context + message }),
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

    await fetch(`http://localhost:5000/chatsource/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: message, assistant: botText })
    });
  } catch (error) {
    botMessageElem.textContent = 'Error: ' + error.message;
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    sendButton.innerText = 'Send';
  }
}


function renderChatList() {
  chatList.innerHTML = "";

  chats.forEach((chat, i) => {
    const li = document.createElement("li");
    li.classList.add("chat-item");

    const chatTitle = document.createElement("span");
    const fullTitle = chat.title || `Chat ${chat.chat_id}`;
    chatTitle.textContent = summarizeTitle(fullTitle);
    chatTitle.title = fullTitle;

    li.appendChild(chatTitle);

    li.addEventListener("click", () => {
      currentChatIndex = i;
      loadChatHistory();
      updateSidebarSelection();
    });

    const menuBtn = document.createElement("button");
    menuBtn.className = "chat-menu-btn";
    menuBtn.innerHTML = "⋮";
    menuBtn.title = "More Options";

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      showMenuPopup(li, chat, i);
    };

    li.appendChild(menuBtn);

    if (i === currentChatIndex) {
      li.classList.add("selected");
    }

    chatList.appendChild(li);
  });
}

function showMenuPopup(parentElement, chat, index) {
  
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
        Rename`;
  
  renameBtn.onclick = (e) => {
    e.stopPropagation();
    menu.remove();
    showRenameInput(parentElement, chat);
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
    await deleteChat(chat.chat_id, index);
  };

  menu.appendChild(renameBtn);
  menu.appendChild(delBtn);
  parentElement.appendChild(menu);

  // Close on outside click
  document.addEventListener("click", function closePopup(event) {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener("click", closePopup);
    }
  });
}

function showRenameInput(parentElement, chat) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = chat.title || `Chat ${chat.chat_id}`;
  input.classList.add("rename-input");

  const chatTitleElem = parentElement.querySelector("span");
  parentElement.replaceChild(input, chatTitleElem);
  input.focus();

  const save = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== chat.title) {
      const response = await fetch(`http://localhost:5000/chatsource/${chat.chat_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (response.ok) {
        chat.title = newTitle;
      } else {
        addMessage("Failed to rename chat", "bot");
      }
    }
    renderChatList();
    updateSidebarSelection();
  };

  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") renderChatList();
  });
}

 

async function deleteChat(chatId, index) {
  try {
    const response = await fetch(`http://localhost:5000/chatsource/${chatId}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete chat');
    await fetchChatList();
    if (chats.length === 0) {o
      currentChatIndex = -1;
      responseArea.innerHTML = "";
    } else {
      currentChatIndex = Math.max(0, index - 1);
      await loadChatHistory();
    }
    updateSidebarSelection();
  } catch (error) {
    addMessage('Error deleting chat: ' + error.message, 'bot');
  }
}

function updateSidebarSelection() {
  Array.from(chatList.children).forEach((li, i) => {
    li.classList.toggle("selected", i === currentChatIndex);
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
    event.preventDefault();
    sendButton.click();
  }
});

toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("sidebar-hidden");
});

window.onload = async () => {
  const chatId = Date.now();
  try {
    const response = await fetch(`http://localhost:5000/chatsource/${chatId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: "" }),
    });
    if (!response.ok) throw new Error('Failed to create new chat');

    await fetchChatList();
    currentChatIndex = chats.findIndex(chat => chat.chat_id === chatId);
    renderChatList();
    await loadChatHistory();
    updateSidebarSelection();
  } catch (error) {
    addMessage('Error creating new chat on load: ' + error.message, 'bot');
    currentChatIndex = -1;
    responseArea.innerHTML = "";
  }

  loadContextFiles();  
};

addChat.addEventListener('click', async () => {
  const chatId = Date.now();
  try {
    const response = await fetch(`http://localhost:5000/chatsource/${chatId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: "" }),
    });
    if (!response.ok) throw new Error('Failed to create new chat');
    await fetchChatList();
    currentChatIndex = chats.findIndex(chat => chat.chat_id === chatId);
    renderChatList();
    await loadChatHistory();
    updateSidebarSelection();
  } catch (error) {
    addMessage('Error creating new chat: ' + error.message, 'bot');
  }
});

document.getElementById('attach-file-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'selectFile' });
});

window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'fileContent') {
    if (!window.contextFiles) window.contextFiles = [];
    if (!window.contextFiles.some(f => f.name === message.name && f.content === message.content)) {
      window.contextFiles.push({ name: message.name, content: message.content, enabled: true });
      saveContextFiles();
      updateContextFilesUI();
    }
  }
});


function updateContextFilesUI() {
  const contextDiv = document.getElementById('context-files');
  contextDiv.innerHTML = '';
  if (window.contextFiles && window.contextFiles.length > 0) {
    window.contextFiles.forEach((file, idx) => {
      const fileElem = document.createElement('span');
      fileElem.className = 'context-file';
      fileElem.textContent = file.name;

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = file.enabled;
      toggle.onchange = () => { file.enabled = toggle.checked; };
      fileElem.appendChild(toggle);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✖';
      removeBtn.className = 'remove-context-file';
      removeBtn.onclick = () => {
        window.contextFiles.splice(idx, 1);
        updateContextFilesUI();
        saveContextFiles();
      };
      fileElem.appendChild(removeBtn);

      contextDiv.appendChild(fileElem);
    });
  }
}

function saveContextFiles() {
  vscode.setState({ contextFiles: window.contextFiles });
}

function loadContextFiles() {
  const state = vscode.getState();
  window.contextFiles = (state && state.contextFiles) ? state.contextFiles : [];
  updateContextFilesUI();
}
function summarizeTitle(title, wordLimit = 5, charLimit = 30) {
  const words = title.split(' ');
  let summary = words.slice(0, wordLimit).join(' ');

  if (summary.length > charLimit) {
    summary = summary.slice(0, charLimit).trim();
  }

  return summary + (words.length > wordLimit || title.length > charLimit ? '...' : '');
}
