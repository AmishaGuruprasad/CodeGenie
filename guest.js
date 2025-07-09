const vscode = acquireVsCodeApi();

const input = document.getElementById("input-txt-box");
const sendButton = document.getElementById("send-button");
const responseArea = document.getElementById("response-area");
const toggleContextBtn = document.getElementById('toggle-context-btn');
const contextDiv = document.getElementById('context-files');

// const api_root = "{{API_ROOT}}"

toggleContextBtn.addEventListener('click', () => {
  const visible = contextDiv.style.display === 'flex' || contextDiv.style.display === 'block';
  contextDiv.style.display = visible ? 'none' : 'flex';
  toggleContextBtn.textContent = visible ? '📂 Show Context Files' : '📂 Hide Context Files';
});

let fileContextMap = {};

class Queue {
  constructor(size) {
    this.size = size;
    this.items = [];
    this.currSize = 0;
  }

  enqueue(element) {
    if (this.currSize !== this.size) {
      this.items[this.currSize] = element;
      this.currSize++;
    }
    else {
      for (let i=0; i<this.size-1; i++) {
        this.items[i] = this.items[i+1];
      }
      this.items[this.size-1] = element;
    }
  }
}

const messageQueue = new Queue(3);

function addMessage(text, sender = 'user') {
  const messageElem = document.createElement('div');
  messageElem.classList.add('chat-message');
  messageElem.classList.add(sender === 'user' ? 'user-message' : 'bot-message');

  if (sender === 'bot') {
    const html = marked.parse(text); 
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

  const req_body = {
    prompt: promptWithContext,
    messages: messageQueue.items  
  };

  try {
    let response = await fetch(`${window.api_root}chat`, {  
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req_body),
    });
    if (!response.ok) throw new Error('Network response was not ok');
    console.log(response);
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
    messageQueue.enqueue({'user': message, 'bot': botText});
    console.log(messageQueue);
    renderResponse(botMessageElem);

  } catch (error) {
    botMessageElem.textContent = 'Error: ' + error.message;
  }
}

function renderResponse(botMessageElem) {
  const codeBlocks = botMessageElem.querySelectorAll('pre > code');
    codeBlocks.forEach(code => {
      const pre = code.parentElement;
      const wrapper = document.createElement('div');
      wrapper.classList.add('code-wrapper');
      pre.parentNode.replaceChild(wrapper, pre);
      wrapper.appendChild(pre);
      const btnContainer = document.createElement('div');
      btnContainer.classList.add('code-button-container');
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

      const insertBtn = document.createElement('button');
      insertBtn.textContent = '➕';
      insertBtn.classList.add('copy-button-inline');
      insertBtn.title = 'Insert code';
      insertBtn.onclick = () => {
        vscode.postMessage({
          type:'insertCode',
          code:code.textContent
        });
        insertBtn.textContent = '✅';
        setTimeout(() => (insertBtn.textContent = '➕'), 1500);
      };

      btnContainer.appendChild(copyBtn);
      btnContainer.appendChild(insertBtn);
      wrapper.appendChild(btnContainer);
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

window.onload = async () => {
  loadContextFiles();  
};

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
    fileContextMap = {}; // Reset file context map

    let fileId = await generateFileId(message.currentFileContent);
    fileContextMap[fileId] = {
        name : message.currentFileName,
        content : message.currentFileContent,
        enabled : false
    };

    if (Object.keys(fileContextMap).length === 0) {
      addFileUI(fileId);
    }
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
  vscode.setState({ fileContextMap: fileContextMap });  
}

function loadContextFiles() {
  const state = vscode.getState();
  window.fileContextMap = (state && state.fileContextMap) ? state.fileContextMap : {};
  for (let fileId in fileContextMap) {
    addFileUI(fileId);
  }
}