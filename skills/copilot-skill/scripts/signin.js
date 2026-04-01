async function execute(args) {
    const {
        envId,
        username,
        password
    } = args;

    // Validate required parameters
    if (!envId) {
        throw new Error('envId parameter is required');
    }

    if (!username) {
        throw new Error('username parameter is required');
    }

    if (!password) {
        throw new Error('password parameter is required');
    }
    // Build request URL
    const baseUrl = `https://${envId}.api.tcloudbasegateway.com`;
    const apiUrl = `${baseUrl}/auth/v1/signin`;

    // Build request body
    const requestBody = {
        username: username,
        password: password,
    };

    // Send request with JSON response handling
    try {
        console.log(apiUrl)
        console.log(JSON.stringify(requestBody))
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log(response)
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        // Parse JSON response
        const responseData = await response.json();
        console.log(responseData)

        return responseData
    } catch (error) {
        throw new Error(`Copilot API call failed: ${error.message}`);
    }
}
const args = require('minimist')(process.argv.slice(2))

execute(args)


