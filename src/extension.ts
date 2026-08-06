process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';


let panel: vscode.WebviewPanel | undefined = undefined;
let isAutoCompleteEnabled = false;

let debounceTimer: NodeJS.Timeout | undefined;
let lastPromiserResolver: ((value:vscode.InlineCompletionList | PromiseLike<vscode.InlineCompletionList>) => void ) | undefined;


// const api_root = "https://joey-obliging-recently.ngrok-free.app/"
const api_root = "http://127.0.0.1:8000/"


let currentFileContent = "";
let currentFilePath = "";

function openBootstrapWebview(context: vscode.ExtensionContext) {
  if (panel) {
    panel.dispose();
  }
  panel = vscode.window.createWebviewPanel(
    'codeGenieBootstrap',
    'Code Genie',
    vscode.ViewColumn.Two,
    {
      enableScripts: true
    }
  );
  const htmlPath = path.join(context.extensionPath, 'webview', 'bootstrap.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace("{{API_ROOT}}", api_root);
  panel.webview.html = html;

  panel.webview.onDidReceiveMessage(message => {
    if (message.command === 'openChat') {
      openChatWebview(context);
    }
    else if (message.command === 'openLogin') {
      openLoginWebview(context);
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function openLoginWebview(context: vscode.ExtensionContext) {
  if (panel) {
    panel.dispose();
  }

  panel = vscode.window.createWebviewPanel(
    'codeGenieLogin',
    'Code Genie Login',
    vscode.ViewColumn.Two,
    {
      enableScripts: true
    }
  );

  const loginHtmlPath = path.join(context.extensionPath, 'webview', 'login.html');
  const loginScriptPath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'login.js'));
  const loginScriptUri = panel.webview.asWebviewUri(loginScriptPath);
  const loginStylePath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'login.css'));
  const loginStyleUri = panel.webview.asWebviewUri(loginStylePath);
  let html = fs.readFileSync(loginHtmlPath, 'utf8');
  html = html.replace("{{API_ROOT}}", api_root);
  html = html.replace(`<link rel="stylesheet" href="login.css">`, `<link rel="stylesheet" href="${loginStyleUri}">`);
  html = html.replace(`<script src="login.js"></script>`, `<script src="${loginScriptUri}"></script>`);
  panel.webview.html = html;

  panel.webview.onDidReceiveMessage(message => {
    if (message.command === 'loginSuccess') {
      vscode.window.showInformationMessage(message.display);
      openChatWebview(context);
    }
    else if (message.command === 'openVerificationPage'){
      openVerifyWebview(context, message.emailId, message.rememberMe);
    }
    else if (message.command === "guestMode") {
      openGuestWebview(context);
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function openVerifyWebview(context: vscode.ExtensionContext, emailId: string, rememberMe : boolean) {
  if (panel) {
    panel.dispose();
  }

  panel = vscode.window.createWebviewPanel(
    'codeGenieLogin',
    'Code Genie Login',
    vscode.ViewColumn.Two,
    {
      enableScripts: true
    }
  );

  const verifyHtmlPath = path.join(context.extensionPath, 'webview', 'verify.html');
  let html = fs.readFileSync(verifyHtmlPath, 'utf8');
  html = html.replace("{{API_ROOT}}", api_root).replace("{{EMAILID}}", emailId).replace("{{REMEMBER ME}}", rememberMe.toString());
  panel.webview.html = html;

  panel.webview.onDidReceiveMessage(message => {
    if (message.command === 'loginSuccess') {
      vscode.window.showInformationMessage(message.display);
      openChatWebview(context);
    }
    if (message.command === 'openLogin'){
      openLoginWebview(context);
    }
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

function openChatWebview(context: vscode.ExtensionContext) {
  if (panel) {
    panel.dispose();
  }
  panel = vscode.window.createWebviewPanel(
    'codeGenieChat',
    'Code Genie Chat',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      enableFindWidget: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))]
    }
  );
  const thisPanel = panel;

  const htmlPath = path.join(context.extensionPath, 'webview', 'chat.html');
  const scriptPath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'chat.js'));
  const stylePath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'chat.css'));
  const scriptUri = panel.webview.asWebviewUri(scriptPath);
  const styleUri = panel.webview.asWebviewUri(stylePath);
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace("{{API_ROOT}}", api_root);
  html = html.replace(`<script src="chat.js"></script>`, `<script src="${scriptUri}"></script>`);
  html = html.replace(`<link rel="stylesheet" href="chat.css">`, `<link rel="stylesheet" href="${styleUri}">`);
  panel.webview.html = html;

  if (currentFileContent !== "") {
    setTimeout(() => {
      thisPanel.webview.postMessage({
        command: 'initContext',
        currentFileContent,
        currentFileName: path.basename(currentFilePath || 'Current File'),
      });
    }, 500);
  }
  
  panel.webview.onDidReceiveMessage(async message => {
    if (message.type === 'selectFile') {
      const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: 'Attach',
        filters: {
          'All files': ['*'],
          'Text files': ['txt', 'md', 'js', 'py', 'json', 'java', 'cpp', 'c', 'html', 'css', 'ts']
        } 
      };

      const fileUri = await vscode.window.showOpenDialog(options);
      const allowedExtensions = ['txt', 'md', 'js', 'py', 'json', 'java', 'cpp', 'c', 'html', 'css', 'ts'];
      if (fileUri && fileUri[0]) {
        const filePath = fileUri[0].fsPath;
        const ext = filePath.split('.').pop()?.toLowerCase();
        
        if (ext && allowedExtensions.includes(ext)) {
          const content = fs.readFileSync(filePath, 'utf8');
          panel!.webview.postMessage({
            type: 'fileContent',
            name: path.basename(filePath),
            content: content
          });
        } 
        else {
          vscode.window.showErrorMessage('Invalid file type selected. Please choose a supported text file.');
        }
      }
    }
    else if (message.type === 'insertCode') {
        
      const editor = vscode.window.activeTextEditor;
      console.log("📝 Active editor:", editor?.document.uri.fsPath);
      if (editor) {
        await vscode.window.showTextDocument(editor.document, editor.viewColumn);
        editor.edit(editBuilder => {
          editBuilder.insert(editor.selection.active, message.code);
        });
      } else {
        vscode.window.showErrorMessage('No active editor found to insert code.');
      }
    }
    else if (message.type === 'sessionExpired'){ 
      vscode.window.showErrorMessage("Session timed out, please sign in again");
      openLoginWebview(context);
    }
    else if (message.command === 'goToLoginPage') {
      openLoginWebview(context);
    }
  });
  panel.onDidDispose(() => {
    panel = undefined;
  });
}


function openGuestWebview(context: vscode.ExtensionContext) {
  if (panel) {
    panel.dispose();
  }

  panel = vscode.window.createWebviewPanel(
    'codeGenieGuestMode',
    'Code Genie Guest Mode',
    vscode.ViewColumn.Two,
    {
      enableScripts: true
    }
  );

  const guestHtmlPath = path.join(context.extensionPath, 'webview', 'guest.html');
  const guestScriptPath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'guest.js'));
  const guestScriptUri = panel.webview.asWebviewUri(guestScriptPath);
  const guestStylePath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'chat.css'));
  const guestStyleUri = panel.webview.asWebviewUri(guestStylePath);
  let html = fs.readFileSync(guestHtmlPath, 'utf8');
  html = html.replace("{{API_ROOT}}", api_root);
  html = html.replace(`<link rel="stylesheet" href="chat.css">`, `<link rel="stylesheet" href="${guestStyleUri}">`);
  html = html.replace(`<script src="guest.js"></script>`, ` <script src="${guestScriptUri}"></script>`);
  panel.webview.html = html;

  panel.webview.onDidReceiveMessage(async message => {
    if (message.type === 'selectFile') {
      const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: 'Attach',
        filters: {
          'All files': ['*'],
          'Text files': ['txt', 'md', 'js', 'py', 'json', 'java', 'cpp', 'c', 'html', 'css', 'ts']
        } 
      };

      const fileUri = await vscode.window.showOpenDialog(options);
      const allowedExtensions = ['txt', 'md', 'js', 'py', 'json', 'java', 'cpp', 'c', 'html', 'css', 'ts'];
      if (fileUri && fileUri[0]) {
        const filePath = fileUri[0].fsPath;
        const ext = filePath.split('.').pop()?.toLowerCase();
        
        if (ext && allowedExtensions.includes(ext)) {
          const content = fs.readFileSync(filePath, 'utf8');
          panel!.webview.postMessage({
            type: 'fileContent',
            name: path.basename(filePath),
            content: content
          });
        } 
        else {
          vscode.window.showErrorMessage('Invalid file type selected. Please choose a supported text file.');
        }
      }
    }
    else if (message.type === 'insertCode') {
        
      const editor = vscode.window.activeTextEditor;
      console.log("📝 Active editor:", editor?.document.uri.fsPath);
      if (editor) {
        await vscode.window.showTextDocument(editor.document, editor.viewColumn);
        editor.edit(editBuilder => {
          editBuilder.insert(editor.selection.active, message.code);
        });
      } else {
        vscode.window.showErrorMessage('No active editor found to insert code.');
      }
    }
    else if (message.type === 'sessionExpired'){ 
      vscode.window.showErrorMessage("Session timed out, please sign in again");
      openLoginWebview(context);
      
    }
  });
  panel.onDidDispose(() => {
    panel = undefined;
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Code Genie extension activated');

  context.subscriptions.push(
    vscode.commands.registerCommand('code-genie.start', async () => {
      const editor = vscode.window.activeTextEditor;
      currentFileContent = editor?.document.getText() || '';
      currentFilePath = editor?.document.uri.fsPath || '';
      openBootstrapWebview(context);
    })
  );

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,100);
  statusBarItem.text = '$(X) CodeGenie: OFF';
  statusBarItem.tooltip = 'Toggle CodeGenie Autocomplete';
  statusBarItem.command = 'code-genie.toggleAutocomplete';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('code-genie.toggleAutocomplete', () => {
      isAutoCompleteEnabled = !isAutoCompleteEnabled;
      statusBarItem.text = isAutoCompleteEnabled ? '$(check) CodeGenie: ON' : '$(x) CodeGenie: OFF';
      vscode.window.showInformationMessage(`CodeGenie Autocomplete ${isAutoCompleteEnabled ? 'Enabled' : 'Disabled'}`);
    })
  );

  const debugcode = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,200);
  debugcode.text = '$(X) DebugWithGenie';
  debugcode.tooltip = 'Toggle DebugWithGenie';
  debugcode.command = 'code-genie.DebugWithGenie';
  debugcode.show();
  context.subscriptions.push(debugcode);
  context.subscriptions.push(
    vscode.commands.registerCommand('code-genie.DebugWithGenie', async() => {
      const currenteditor = vscode.window.activeTextEditor;
      if(currenteditor){
        const document = currenteditor.document;
        const content = document.getText();
        console.log(content);
        const modelDebugPrompt = (
            "You are a strict coding assistant. Fix the following code. " +
            "**Return only the fixed code block, enclosed in markdown triple backticks. Do not add any other text, explanation, or comments.**\n" +
            "\n```\n" +
            `${content.trim()}\n` +
            "```\n" +
            "Please provide the corrected code within a new, complete markdown code block. Example:\n" +
            "```java\n" +
            "// corrected code here\n" +
            "```\n\n" +
            "Your corrected code:\n" +
            "```\n" 
        );
        const result =await get_suggestion_debug(modelDebugPrompt);
        if(result != null){
          const full_range = new vscode.Range(
            new vscode.Position(0, 0),
            document.lineAt(document.lineCount - 1).range.end
          );
          const succ = await currenteditor.edit(editBuilder =>{
            editBuilder.replace(full_range,result);
          });
          if(!succ){
            vscode.window.showErrorMessage("Edit failed.");
          }
        }else{
          vscode.window.showErrorMessage("Nothing to return null");
        }
      }else{
        vscode.window.showErrorMessage("No active editor found.");
      }
    })
  );
  async function  get_suggestion_debug(content:string): Promise<string | null> {
    if(!content.trim()) {
      return null;
    }
    try {      
      const response = await axios.post(
        `${api_root}generate`,
        { prompt: content },
        {
          headers: {
            "Content-Type": "application/json"
          },
          httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false })
        }
      );
      if (response.status !== 200) {
        console.error("Autocomplete error:", response.status, response.data);
        throw new Error(`HTTP error: ${response.status}`);
      }
      return response.data.text.trim();
    } catch (err) {
      console.error("Network error during autocomplete:", err);
      return null;
    }
  }

  const provider: vscode.InlineCompletionItemProvider ={
    provideInlineCompletionItems: function (document, position, context, token) {
      if (!isAutoCompleteEnabled) {
        return Promise.resolve({ items: [] });
      }

      const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0,0),position));
      const textAfterCursor = document.getText(new vscode.Range(position, new vscode.Position(document.lineCount,0)));
      return new Promise<vscode.InlineCompletionList>((resolve)=>{
        if(debounceTimer){
          clearTimeout(debounceTimer);
        }

        if(lastPromiserResolver){
          lastPromiserResolver({items: []});
        }

        lastPromiserResolver = resolve;
        let full_prompt = `${textBeforeCursor}+${textAfterCursor}`;
        
        console.log(`full_prompt: ${full_prompt}`);

        debounceTimer = setTimeout(async() =>{
          const suggestion = await getSuggestionFromApi(full_prompt);

          resolve({
            items:suggestion?[
              {
                insertText: suggestion,
                range: new vscode.Range(position.translate(0,0),position),
              }
            ]:[]
          });

          lastPromiserResolver = undefined;
        },3000); 
      });
    }
  };
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider)
  );
}

async function getSuggestionFromApi(full_prompt: string): Promise<string | null> {
  if (!full_prompt.trim()) return null;

  try {
    const response = await axios.post(
      `${api_root}auto_complete`,{ 
        prompt: full_prompt ,
        headers: {
          "Content-Type": "application/json"
        },
        httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false })
      }
    );

    if (response.status !== 200) {
      console.error("Autocomplete error:", response.status, response.data);
      throw new Error(`HTTP error: ${response.status}`);
    }

    return response.data.text.trim();
  } catch (err) {
    console.error("Network error during autocomplete:", err);
    return null;
  }
}

export function deactivate() {
  if (panel) {
    panel.dispose();
  }
}
