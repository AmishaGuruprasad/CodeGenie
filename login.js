const mainDiv = document.getElementById("mainDiv");
const emailInput = document.getElementById("emailInput");
const nameInput = document.getElementById("nameInput");
const pswdInput = document.getElementById("pswdInput");
const signInButton = document.getElementById("signInButton");
const signUpButton = document.getElementById("signUpButton");
const signUpLink = document.getElementById("signUpLink");
const signInLink = document.getElementById("signInLink");
const guestModeLink = document.getElementById("guestModeLink");

const api_root = "http://"

async function signIn() {
    let emailId = emailInput.textContent;
    let password = pswdInput.textContent;
    try {
        const response = await fetch(`${api_root}signin`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: stringify({emailid: emailId, password: password})
        });
    } catch (error) {
        console.log("Error logging in");
    }
}

async function signUp() {
    let emailId  = emailInput.textContent;
    let name = nameInput.textContent;
    let password = pswdInput.textContent;
    try {
        const response = await fetch(`${api_root}signup`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: stringify({emailid: emailId, name: name, password: password})
        });
    } catch (error) {
        console.log("Error logging in");
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

signInButton.addEventListener("click", signIn);
signUpLink.addEventListener("click", goToSignUp);
signUpButton.addEventListener("click", signUp);
signInLink.addEventListener("click", goToSignIn);
guestModeLink.addEventListener("click", guestMode);
