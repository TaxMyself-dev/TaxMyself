const serverAddress = 'http://localhost:3000'

document.getElementById('signup').onclick = function() {
    const username = document.getElementById('nameInputSignUp').value
    const email = document.getElementById('emailInputSignUp').value
    const password = document.getElementById('passwordInputSignUp').value
    const statubar = document.getElementById('statusbar')
    fetch(serverAddress + '/signup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password })
        })
    .then(response => {
        if (!response.ok) {
            statubar.value = "Login failed"
        }
        return response.text();
    })
    .then(data => {
        console.log(data); // You would typically store the returned token in local storage here
    })
    .catch(e => {
            statubar.value = "Login failed"
    });
}