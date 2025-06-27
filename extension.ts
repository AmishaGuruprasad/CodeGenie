import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const RelativePattern = vscode.RelativePattern;


let inlineDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let panel: vscode.WebviewPanel | undefined = undefined;
let inlineSuggestionsEnabled: boolean = false;
let fileContextMap: { [key: string]: string } = {}; // Added declaration for fileContextMap

let isAutoCompleteEnabled = false;

let debounceTimer: NodeJS.Timeout | undefined;
let lastPromiserResolver: ((value:vscode.InlineCompletionList | PromiseLike<vscode.InlineCompletionList>) => void ) | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Code Genie extension activated');

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  function updateStatusBar() {
    statusBarItem.text = inlineSuggestionsEnabled
      ? '$(check) Genie Suggestions: On'
      : '$(x) Genie Suggestions: Off';
    statusBarItem.tooltip = 'Click to toggle Code Genie inline suggestions';
  }
  updateStatusBar();
  statusBarItem.command = 'code-genie.toggleInlineSuggestions';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('code-genie.toggleInlineSuggestions', () => {
      inlineSuggestionsEnabled = !inlineSuggestionsEnabled;
      updateStatusBar();
      vscode.window.showInformationMessage(
        `Inline suggestions ${inlineSuggestionsEnabled ? 'enabled' : 'disabled'}.`
      );
    })
  );


  context.subscriptions.push(
    vscode.commands.registerCommand('code-genie.openchat', async () => {
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
        

          


        
        setTimeout(() => {
          
            thisPanel.webview.postMessage({
              command: 'initContext',
              currentFileContent,
              currentFileName: path.basename(currentFilePath || 'Current File'),
              // fileList
            });
          
        }, 500);


        panel.webview.onDidReceiveMessage(async message => {
          // 📌 Added: Serve content for selected sibling files
          if (message.command === 'initContext') {
            fileContextMap['Current File'] = message.currentFileContent;
          
            // ✅ DEBUG ADD THIS:
            const contextDiv = document.getElementById('context-files');
            if (contextDiv) {
              const block = document.createElement('div');
              block.innerHTML = `<p><strong>Current File</strong></p><pre>${message.currentFileContent.slice(0, 500)}</pre>`;
              contextDiv.appendChild(block);
            } else {
              console.error('Context div not found');
            }
          }
          
          // if (message.command === 'readFile') {
          //   const fileUri = vscode.Uri.file(message.path);
          //   const doc = await vscode.workspace.openTextDocument(fileUri);
          //   thisPanel.webview.postMessage({
          //     command: 'fileContent',
          //     path: message.path,
          //     content: doc.getText()
          //   });
          // }
          if (message.type === 'toggleInlineSuggestions') {
            inlineSuggestionsEnabled = message.enabled;
            updateStatusBar();
            vscode.window.showInformationMessage(
              `Inline suggestions ${inlineSuggestionsEnabled ? 'enabled' : 'disabled'}.`
            );
          }
          if (message.type === 'fileUpload') {
            const fileName = message.filename;
            const fileContent = message.content;
            const workspaceFolders = vscode.workspace.workspaceFolders;

            if (workspaceFolders && workspaceFolders.length > 0) {
              const folderUri = workspaceFolders[0].uri;
              const filePath = path.join(folderUri.fsPath, fileName);

              fs.writeFile(filePath, fileContent, err => {
                if (err) {
                  vscode.window.showErrorMessage(`Failed to save file: ${err.message}`);
                } else {
                  vscode.window.showInformationMessage(`📎 File saved: ${fileName}`);
                }
              });
            } else {
              vscode.window.showErrorMessage('No workspace folder open to save the file.');
            }
          }
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

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'java' },
        { scheme: 'file', language: 'csharp' }
      ],
      {
        async provideInlineCompletionItems(document, position, context, token) {
          console.log('Genie inline provider called for language:', document.languageId);
          if (!inlineSuggestionsEnabled) return { items: [] };

          if (inlineDebounceTimer) clearTimeout(inlineDebounceTimer);
          return new Promise<vscode.InlineCompletionList>(resolve => {
            inlineDebounceTimer = setTimeout(async () => {
              const linePrefix = document.lineAt(position).text.substr(0, position.character);
              const fileContent = document.getText();
              
              try {
                const response = await fetch('http://127.0.0.1:5000/autocomplete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: fileContent, linePrefix })
                });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const suggestions = (await response.json()) as string[];
                console.log('Suggestions received:', suggestions);
                if (suggestions.length === 0) {
                  resolve({ items: [] });
                  return;
                }
                const ghostText = suggestions[0];
                const inlineItem = new vscode.InlineCompletionItem(
                  ghostText,
                  new vscode.Range(position, position)
                );
                resolve({ items: [inlineItem] });
              } catch (err) {
                console.error('Error fetching suggestions:', err);
                resolve({ items: [] });
              } finally {
                inlineDebounceTimer = null;
              }
            }, 500);
          });
        }
      }
    )
  );

  vscode.workspace.getConfiguration().update('editor.inlineSuggest.enabled', true, true);
}

