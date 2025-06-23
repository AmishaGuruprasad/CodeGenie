const vscode = acquireVsCodeApi();

let contextFiles = []; // Stores active + attached files
let chatId = Date.now(); // Dummy chat ID — replace with dynamic if needed
let isGenerating = false;

window.addEventListener('DOMContentLoaded', async () => {
  // DOM element queries
  const input = document.getElementById("input-txt-box");
  const sendButton = document.getElementById("send-button");
  const responseArea = document.getElementById("response-area");
  const chatList = document.getElementById("chat-list");
  const attachFileBtn = document.getElementById("attach-file-btn");
  const fileInput = document.getElementById("file-input");
  const contextFilesDiv = document.getElementById("context-files");
  const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const sidebar = document.getElementById("sidebar");

  //FOR RENDERING THE CONTEXTFILES
  async function saveContextFiles() {
    // Save current contextFiles to backend for this chat
    await fetch(`http://127.0.0.1:5000/chatsource/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextFiles: contextFiles.map(f => ({ name: f.name, content: f.content, enabled: f.enabled !== false })) })
    });
  }

  function renderContextFiles() {
    contextFilesDiv.innerHTML = "";
    contextFiles.forEach((file, idx) => {
      const fileElem = document.createElement("div");
      fileElem.className = "context-file";
      fileElem.textContent = file.name;
      // Show remove button for all files, including the active file
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-context-file";
      removeBtn.textContent = "✕";
      removeBtn.title = "Remove file from context";
      removeBtn.onclick = async () => {
        contextFiles.splice(idx, 1);
        renderContextFiles();
        await saveContextFiles();
      };
      fileElem.appendChild(removeBtn);
      if (idx === 0) fileElem.title = "Current active file (auto-attached)";
      contextFilesDiv.appendChild(fileElem);
    });
  }

  function setPromptEnabled(enabled) {
    input.disabled = !enabled;
    sendButton.disabled = !enabled;
  }

  // --- Chat History Logic ---
  async function fetchAndRenderChatList() {
    try {
      const res = await fetch('http://127.0.0.1:5000/list-all-chats');
      const chats = await res.json();
      chatList.innerHTML = '';
      if (Array.isArray(chats)) {
        chats.forEach(chat => {
          const li = document.createElement('li');
          li.textContent = chat.title || `Chat ${chat.chat_id}`;
          if (chat.chat_id === chatId) li.classList.add('selected');
          // --- Rename button ---
          const renameBtn = document.createElement('button');
          renameBtn.textContent = '✎';
          renameBtn.title = 'Rename chat';
          renameBtn.className = 'chat-menu-btn';
          renameBtn.onclick = (e) => {
            e.stopPropagation();
            const inputRename = document.createElement('input');
            inputRename.type = 'text';
            inputRename.value = chat.title || '';
            inputRename.className = 'rename-input';
            li.innerHTML = '';
            li.appendChild(inputRename);
            inputRename.focus();
            inputRename.onkeydown = async (ev) => {
              if (ev.key === 'Enter') {
                await renameChat(chat.chat_id, inputRename.value);
              }
            };
            inputRename.onblur = async () => {
              await renameChat(chat.chat_id, inputRename.value);
            };
          };
          // --- Delete button ---
          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = '🗑';
          deleteBtn.title = 'Delete chat';
          deleteBtn.className = 'chat-menu-btn';
          deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            await deleteChat(chat.chat_id);
          };
          li.appendChild(renameBtn);
          li.appendChild(deleteBtn);
          li.onclick = () => loadChat(chat.chat_id);
          chatList.appendChild(li);
        });
      }
    } catch (e) {
      chatList.innerHTML = '<li style="color:red">Failed to load chats</li>';
    }
  }

  async function renameChat(id, newTitle) {
    await fetch(`http://127.0.0.1:5000/chatsource/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });
    fetchAndRenderChatList();
  }

  async function deleteChat(id) {
    await fetch(`http://127.0.0.1:5000/chatsource/${id}`, { method: 'DELETE' });
    // Do NOT create a new chat here; just refresh the list
    await fetchAndRenderChatList();
  }

  // Add Delete All Chats button to sidebar
  const deleteAllBtn = document.createElement('button');
  deleteAllBtn.textContent = 'Delete All Chats';
  deleteAllBtn.className = 'chat-menu-btn';
  deleteAllBtn.style.margin = '10px 0';
  deleteAllBtn.onclick = async () => {
    await deleteAllChats();
  };
  sidebar.insertBefore(deleteAllBtn, chatList);

  async function deleteAllChats() {
    try {
      await fetch('http://127.0.0.1:5000/list-all-chats', { method: 'DELETE' });
      await createNewChat();
      await fetchAndRenderChatList();
    } catch (e) {
      alert('Failed to delete all chats');
    }
  }

  // --- New Chat Creation ---
  async function createNewChat() {
    chatId = Date.now();
    responseArea.innerHTML = '';
    contextFiles = [];
    renderContextFiles();
    // Create new chat in backend
    console.log('[CodeGenie] Creating new chat:', chatId);
    try {
      const res = await fetch(`http://127.0.0.1:5000/chatsource/${chatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '', contextFiles: [] })
      });
      const data = await res.json().catch(() => ({}));
      console.log('[CodeGenie] New chat POST response:', res.status, data);
    } catch (err) {
      console.error('[CodeGenie] Error creating new chat:', err);
    }
    fetchAndRenderChatList();
  }

  async function loadChat(id) {
    chatId = id;
    responseArea.innerHTML = '';
    contextFiles = [];
    renderContextFiles();
    try {
      const res = await fetch(`http://127.0.0.1:5000/chatsource/${id}`);
      const data = await res.json();
      // data: { messages: [...], contextFiles: [...] }
      if (data && Array.isArray(data.messages)) {
        data.messages.forEach(msg => {
          appendMessage('user', msg.user);
          appendMessage('bot', msg.assistant);
        });
      }
      if (data && Array.isArray(data.contextFiles)) {
        contextFiles = data.contextFiles.map(f => ({ ...f, enabled: f.enabled !== false }));
        renderContextFiles();
      }
    } catch (e) {
      appendMessage('bot', '[Failed to load chat history]');
    }
    fetchAndRenderChatList();
  }

  function appendMessage(sender, text) {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message", sender === "bot" ? "bot-message" : "user-message");
    msgDiv.innerText = text;
    responseArea.appendChild(msgDiv);
    responseArea.scrollTop = responseArea.scrollHeight;
  }

  async function sendMessage(message) {
    appendMessage("bot", "Genie is thinking...");
    setPromptEnabled(false);
    isGenerating = true;
    let contextFilesToSend = contextFiles || [];
    contextFilesToSend = contextFilesToSend
      .filter((f) => f.enabled)
      .map((f) => ({ name: f.name, content: f.content }));
    try {
      const response = await fetch(`http://127.0.0.1:5000/chatsource/${chatId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: message,
          contextFiles: contextFilesToSend
        })
      });
      if (!response.ok) {
        appendMessage("bot", "[Error from server]");
        setPromptEnabled(true);
        isGenerating = false;
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partial = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        responseArea.lastChild.innerText = partial;
      }
    } catch (err) {
      appendMessage("bot", `[Network Error: ${err.message}]`);
    }
    setPromptEnabled(true);
    isGenerating = false;
  }

  // --- New Chat button logic ---
  if (newChatBtn) {
    newChatBtn.addEventListener('click', async () => {
      await createNewChat();
    });
  }

  if (toggleSidebarBtn && sidebar) {
    toggleSidebarBtn.addEventListener("click", () => {
      sidebar.classList.toggle("sidebar-hidden");
    });
  }

  // Arrow scroll for context files
  const leftArrow = document.getElementById("context-files-left");
  const rightArrow = document.getElementById("context-files-right");
  const contextFilesScrollbox = document.getElementById("context-files-scrollbox");

  if (leftArrow && rightArrow && contextFilesScrollbox) {
    leftArrow.onclick = () => {
      contextFilesScrollbox.scrollBy({ left: -100, behavior: 'smooth' });
    };
    rightArrow.onclick = () => {
      contextFilesScrollbox.scrollBy({ left: 100, behavior: 'smooth' });
    };
  }

  // Prevent prompt while generating
  input.addEventListener("keydown", (e) => {
    if (isGenerating) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendButton.click();
    }
  });
  sendButton.addEventListener("click", () => {
    if (isGenerating) return;
    const userPrompt = input.value.trim();
    if (userPrompt) {
      appendMessage("user", userPrompt);
      sendMessage(userPrompt);
      input.value = "";
    }
  });

  attachFileBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "selectFile" });
  });

  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      if (contextFiles.length === 0) {
        // If no context files, just add all
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            contextFiles.push({ name: file.name, content: evt.target.result, enabled: true });
            renderContextFiles();
            await saveContextFiles();
          };
          reader.readAsText(file);
        });
      } else {
        // If context files exist, add after the active file
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            if (!contextFiles.some(f => f.name === file.name)) {
              contextFiles.push({ name: file.name, content: evt.target.result, enabled: true });
              renderContextFiles();
              await saveContextFiles();
            }
          };
          reader.readAsText(file);
        });
      }
    }
    fileInput.value = "";
  });

  // Drag-and-drop support for context files
  contextFilesDiv.addEventListener("dragover", (e) => {
    e.preventDefault();
    contextFilesDiv.style.background = "#222a";
  });
  contextFilesDiv.addEventListener("dragleave", (e) => {
    e.preventDefault();
    contextFilesDiv.style.background = "";
  });
  contextFilesDiv.addEventListener("drop", (e) => {
    e.preventDefault();
    contextFilesDiv.style.background = "";
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        if (!contextFiles.some(f => f.name === file.name)) {
          contextFiles.push({ name: file.name, content: evt.target.result, enabled: true });
          renderContextFiles();
          await saveContextFiles();
        }
      };
      reader.readAsText(file);
    });
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "activeFile": {
        const activeFile = {
          name: message.name,
          content: message.content,
          enabled: true
        };
        if (contextFiles.length > 0 && contextFiles[0].name === activeFile.name) {
          contextFiles[0] = activeFile;
        } else {
          contextFiles = [activeFile, ...contextFiles.slice(1)];
        }
        renderContextFiles();
        break;
      }
      case "contextFiles": {
        if (Array.isArray(message.files)) {
          const additionalFiles = message.files.map((file) => ({
            name: file.name,
            content: file.content,
            enabled: true
          }));
          const existingNames = new Set(contextFiles.map(f => f.name));
          const newFiles = additionalFiles.filter(f => !existingNames.has(f.name));
          if (contextFiles.length === 0) {
            contextFiles = [...newFiles];
          } else {
            contextFiles = [contextFiles[0], ...contextFiles.slice(1), ...newFiles];
          }
          renderContextFiles();
        }
        break;
      }
      case "response_from_flask":
        appendMessage("bot", message.value);
        break;
    }
  });

  // --- Startup: create new chat and load history ---
  await createNewChat();
  await fetchAndRenderChatList();
});
