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
const errorMessage = document.getElementById("errorMessage");



// const api_root = "{{API_ROOT}}"

function removeLabelIfNotEmpty(fieldName, value){
    if (value!==""){
        const label = document.getElementById(`${fieldName}Label`);
        if (label) label.remove()
    }

}
function checkIfEmpty(messageName, fieldName, inputElement){
    if (inputElement.value===""){
        let label = document.getElementById(`${fieldName}Label`);
        if (!label){
            label = document.createElement("label");
            label.setAttribute("for", `${fieldName}Input`);
            label.setAttribute("id", `${fieldName}Label`);
            label.innerText = `${messageName} can not be empty`;
            mainDiv.insertBefore(label,inputElement);
            }
        }
}


function validate(password){
    if(password.length<8)
        return false
    if (!/[A-Z]/.test(password)) 
        return false
    if(!/[a-z]/.test(password))
        return false
    if(!/[0-9]/.test(password))
        return false
    if (!/[!@#$%^&*]/.test(password))
        return false
    return true 
}

async function login() {
    let emailId = emailInput.value;
    let password = pswdInput.value;
    let rememberMe = rememberBox.checked;

    removeLabelIfNotEmpty("email", emailId);
    removeLabelIfNotEmpty("pswd", password);
    if (emailId==="" || password===""){
        checkIfEmpty("Email" , "email", emailInput);
        checkIfEmpty("Password" , "pswd", pswdInput);
        return;
    }

    console.log(JSON.stringify({emailId: emailId, password: password, rememberMe: rememberMe}));
    try {
        const response = await fetch(`${window.api_root}login`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json',  "ngrok-skip-browser-warning": "true"},
            body: JSON.stringify({emailId: emailId, password: password, rememberMe: rememberMe})
        }); 
        const data = await response.json();
        if (response.ok) {
            vscode.postMessage({command: 'loginSuccess', display: data["message"]});
        }
        else if (response.status === 404){
            errorMessage.innerHTML = "Invalid Email ID.";
            errorMessage.style.display = "block";
        }
        else if (response.status === 401){
            errorMessage.innerHTML = "Invalid password";
            errorMessage.style.display = "block";
        }
        
        else{
            console.log("HTTP Error Status : " + response.status);
        }
    } catch (error) {
        console.log("Error logging in : " + error);
    }
}



async function signup() {
    let emailId  = emailInput.value;
    let name = nameInput.value;
    let password = pswdInput.value;
    let rememberMe = rememberBox.checked;

    errorMessage.style.display="none";
    removeLabelIfNotEmpty("email", emailId);
    removeLabelIfNotEmpty("pswd", password);
    removeLabelIfNotEmpty("name", name);
    if (emailId==="" || password==="" || name===""){
        checkIfEmpty("Email" , "email", emailInput);
        checkIfEmpty("Password","pswd" , pswdInput);
        checkIfEmpty("Name", "name" , nameInput);
        return;
    }

    if(!validate(password)){
        errorMessage.innerHTML = "1.The length of password must be greater then or equal to 8 <br> 2.The password must consist of atleast 1 capital letter, small letter, number and special character each"
        errorMessage.style.display="block";
        return;
    }
    

    try {
        const response = await fetch(`${api_root}signup`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json',  "ngrok-skip-browser-warning": "true"},
            body: JSON.stringify({emailId: emailId, name: name, password: password, rememberMe: rememberMe})
        });

        if (response.ok) {
            vscode.postMessage({command : "openVerificationPage", emailId : emailId, rememberMe: rememberMe});
        }
        else if (response.status === 409){
            errorMessage.innerHTML = "Account already exists. Please sign in to continue";
            errorMessage.style.display = "block";
            goToSignIn(true);
        }

        else if (response.status === 400) {
            errorMessage.innerHTML = "Invalid Email ID. Verification email could not be sent.";
            errorMessage.style.display = "block";
        }
        else {
            errorMessage.innerHTML = "Something went wrong. Please try again";
            errorMessage.style.display = "block";
        }
    } catch (error) {
        console.log("Error signing up");
    }
}

function removeLabels(){
    let labels = document.getElementsByTagName("label");
    if (labels) 
        Array.from(labels).forEach((label)=>{
            label.remove();
        });
}
function goToSignUp() {
    removeLabels();   
    errorMessage.style.display = "none";
    nameInput.style.display = "block";
    signInButton.style.display = "none";
    signUpButton.style.display = "block";
    document.getElementById("noAcc").style.display = "none";
    signInLink.style.display = "block";
    
}

function goToSignIn(accountExists = false) {
    removeLabels(); 
    if (!accountExists) errorMessage.style.display = "none";
    nameInput.style.display = "none";
    signInButton.style.display = "block";
    signUpButton.style.display = "none";
    document.getElementById("noAcc").style.display = "block";
    signInLink.style.display = "none";
    
}

function guestMode() {
    vscode.postMessage({command : "guestMode"});
}

signInButton.addEventListener("click", login);
signUpLink.addEventListener("click", goToSignUp);
signUpButton.addEventListener("click", signup);
signInLink.addEventListener("click", goToSignIn);
guestModeLink.addEventListener("click", guestMode);

document.addEventListener("keydown",(event)=>{
if(event.key==="Enter"){
    if (signInButton.style.display === "none"){
        signup();
    }
    else{
        login();
    }
    
}
});
