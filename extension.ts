process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import * as crypto from 'crypto';
//const RelativePattern = vscode.RelativePattern;


let panel: vscode.WebviewPanel | undefined = undefined;
let fileContextMap: { [key: string]: string } = {}; // Added declaration for fileContextMap
let isAutoCompleteEnabled = false;

let debounceTimer: NodeJS.Timeout | undefined;
let lastPromiserResolver: ((value:vscode.InlineCompletionList | PromiseLike<vscode.InlineCompletionList>) => void ) | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Code Genie extension activated');

  context.subscriptions.push(
    vscode.commands.registerCommand('code-genie.openchat', async () => {
      console.log("hello from register command callback")
      if (panel) {
        panel.dispose();
        panel = undefined;
      } else {
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
        // panel 
        const thisPanel = panel;
        // vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        //   if (editor && thisPanel) {
        //     const currentFileContent = editor.document.getText();
        //     const currentFileName = vscode.workspace.asRelativePath(editor.document.uri.fsPath);
        //     console.log('[CodeGenie] Sending new context:', currentFileName);

        //     thisPanel.webview.postMessage({
        //       command: 'initContext',
        //       currentFileContent,
        //       currentFileName
        //     });
        //   }
        // });

        const htmlPath = path.join(context.extensionPath, 'webview', 'chat.html');
        const scriptPath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'chat.js'));
        const stylePath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'chat.css'));
        const scriptUri = panel.webview.asWebviewUri(scriptPath);
        const styleUri = panel.webview.asWebviewUri(stylePath);
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace(`<script src="chat.js"></script>`, `<script src="${scriptUri}"></script>`);
        html = html.replace(`<link rel="stylesheet" href="chat.css">`, `<link rel="stylesheet" href="${styleUri}">`);
        panel.webview.html = html;
        // for context file adding
        // 📌 Load current file content and sibling file list, even across folders
        const editor = vscode.window.activeTextEditor;
        const currentFileContent = editor?.document.getText() || '';
        const currentFilePath = editor?.document.uri.fsPath || '';

        // let fileList: { name: string; path: string }[] = [];

        // // 🔍 Try to use folder of the active file
        // let folderUri: vscode.WorkspaceFolder | undefined;
        // if (editor?.document?.uri) {
        //   folderUri = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        // }

        // // 🧠 Fallback: use first workspace folder if no file is open
        // if (!folderUri && vscode.workspace.workspaceFolders?.length) {
        //   folderUri = vscode.workspace.workspaceFolders[0];
        // }

        // // 🔎 Scan for common source/text files (ignore node_modules)
        // if (folderUri) {
        //   const files = await vscode.workspace.findFiles(
        //     new vscode.RelativePattern(folderUri.uri, '**/*.{js,ts,py,java,c,c++,txt,md}'),
        //     '**/node_modules/**'
        //   );
        
          // fileList = files.map(uri => ({
          //   name: vscode.workspace.asRelativePath(uri),
          //   path: uri.fsPath
          // }));
        // }
        
        let userId = context.globalState.get("userId") as string;

        if (!userId) {
            userId = crypto.randomUUID()
            context.globalState.update("userId", userId);
        }

        


        
        setTimeout(() => {
            thisPanel.webview.postMessage({ 
              type: "userId", 
              value: userId 
            });
              
          
            thisPanel.webview.postMessage({
              command: 'initContext',
              currentFileContent,
              currentFileName: path.basename(currentFilePath || 'Current File'),
              // fileList
            });
          
        }, 500);


        panel.webview.onDidReceiveMessage(async message => {
          // 📌 Added: Serve content for selected sibling files
          // if (message.command === 'initContext') {
          //   fileContextMap['Current File'] = message.currentFileContent;
          
          //   // ✅ DEBUG ADD THIS:
          //   const contextDiv = document.getElementById('context-files');
          //   if (contextDiv) {
          //     const block = document.createElement('div');
          //     block.innerHTML = `<p><strong>Current File</strong></p><pre>${message.currentFileContent.slice(0, 500)}</pre>`;
          //     contextDiv.appendChild(block);
          //   } else {
          //     console.error('Context div not found');
          //   }
          // }
          
          // if (message.command === 'readFile') {
          //   const fileUri = vscode.Uri.file(message.path);
          //   const doc = await vscode.workspace.openTextDocument(fileUri);
          //   thisPanel.webview.postMessage({
          //     command: 'fileContent',
          //     path: message.path,
          //     content: doc.getText()
          //   });
          // }
          
          // if (message.type === 'fileUpload') {
          //   const fileName = message.filename;
          //   const fileContent = message.content;
          //   const workspaceFolders = vscode.workspace.workspaceFolders;

          //   if (workspaceFolders && workspaceFolders.length > 0) {
          //     const folderUri = workspaceFolders[0].uri;
          //     const filePath = path.join(folderUri.fsPath, fileName);

          //     fs.writeFile(filePath, fileContent, err => {
          //       if (err) {
          //         vscode.window.showErrorMessage(`Failed to save file: ${err.message}`);
          //       } else {
          //         vscode.window.showInformationMessage(`📎 File saved: ${fileName}`);
          //       }
          //     });
          //   } else {
          //     vscode.window.showErrorMessage('No workspace folder open to save the file.');
          //   }
          // }
          // done
          if (message.type === 'selectFile') {
            const options: vscode.OpenDialogOptions = {
              canSelectMany: false,  //change to true later
              openLabel: 'Attach',
              filters: {
                'All files': ['*'],
                'Text files': ['txt', 'md', 'js', 'py', 'json', 'java', 'cpp', 'c', 'html', 'css', 'ts']
              }   //add more file type options in text files and also allowedExtensions
            };

        
            const fileUri = await vscode.window.showOpenDialog(options);
            const allowedExtensions = ['txt', 'md', 'js', 'py', 'json', 'java', 'cpp', 'c', 'html', 'css', 'ts'];
            //if selecting multiple files is allowed then iterate thru the fileuri list and read content for every file
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
        });
        panel.onDidDispose(() => {
          panel = undefined;
        });
      }
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
        let full_prompt = `<|fim_start|>${textBeforeCursor}<|fim_hole|>${textAfterCursor}<|fim_end|>`;
        
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
        },3000); //--> 3000ms ->3sec it will wait

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
      "https://61d3-34-73-152-117.ngrok-free.app",
      { prompt: full_prompt },
      {
        headers: {
          "Content-Type": "application/json"
        },
        // Optional: add this if you want to ignore SSL issues (not recommended for production)
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

  