const vscode = acquireVsCodeApi();

const mainDiv = document.getElementById("mainDiv");
const emailInput = document.getElementById("emailInput");
const nameInput = document.getElementById("nameInput");
const pswdInput = document.getElementById("pswdInput");
const signInButton = document.getElementById("signInButton");
const signUpButton = document.getElementById("signUpButton");
const signUpLink = document.getElementById("signUpLink");
const signInLink = document.getElementById("signInLink");
const rememberBox = document.getElementById("rememberBox");
const guestModeLink = document.getElementById("guestModeLink");

const api_root = "https://e8e3-34-41-73-8.ngrok-free.app/"

async function login() {
    let emailId = emailInput.value;
    let password = pswdInput.value;
    let rememberMe = rememberBox.checked;
    console.log(JSON.stringify({emailId: emailId, password: password, rememberMe: rememberMe}));
    try {
        const response = await fetch(`${api_root}login`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({emailId: emailId, password: password, rememberMe: rememberMe})
        }); 
        const data = await response.json();
        if (response.ok) {
            vscode.postMessage({command: 'loginSuccess', display: data["message"]});
        }
        else {
            console.log("HTTP Error Status : " + response.status);
            //signUpLink.click();
            //vscode.window.showErrorMessage("Invalid Credentials");
        }
    } catch (error) {
        console.log("Error logging in : " + error);
    }
}

async function signup() {
    let emailId  = emailInput.textContent;
    let name = nameInput.textContent;
    let password = pswdInput.textContent;
    let rememberMe = rememberBox.checked;
    try {
        const response = await fetch(`${api_root}signup`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({emailId: emailId, name: name, password: password, rememberMe: rememberMe})
        });
        const data = await response.json();
        if (response.ok) {
            vscode.postMessage({command: 'loginSuccess', display: data["message"]});
        }
        else {
            console.log("HTTP Error Status : " + response.status);
            //signInLink.click();
            //vscode.window.showErrorMessage("Email ID already registered");
        }
    } catch (error) {
        console.log("Error signing up");
    }
}

function goToSignUp() {
    nameInput.style.display = "block";
    signInButton.style.display = "none";
    signUpButton.style.display = "block";
    document.getElementById("noAcc").style.display = "none";
    signInLink.style.display = "block";
}

function goToSignIn() {
    nameInput.style.display = "none";
    signInButton.style.display = "block";
    signUpButton.style.display = "none";
    document.getElementById("noAcc").style.display = "block";
    signInLink.style.display = "none";
}

function guestMode() {
    //go to CodeGenie without a database
}

signInButton.addEventListener("click", login);
signUpLink.addEventListener("click", goToSignUp);
signUpButton.addEventListener("click", signup);
signInLink.addEventListener("click", goToSignIn);
guestModeLink.addEventListener("click", guestMode);
