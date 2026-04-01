async function execute(args) {
    const {
        envId,
        token,
        title,
    } = args;

    // Validate required parameters
    if (!envId) {
        throw new Error('envId parameter is required');
    }

    if (!token) {
        throw new Error('token parameter is required');
    }

    if (!title) {
        throw new Error('title parameter is required');
    }
    // Build request URL
    const baseUrl = `https://${envId}.api.tcloudbasegateway.com`;
    const apiUrl = `${baseUrl}/v1/aibot/copilot/conversation`;

    // Build request body
    const requestBody = {
        title: title,
        type: 'ide',
    };

    // Send request with JSON response handling
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json()
        console.log(data)
        return data

    } catch (error) {
        throw new Error(`Copilot API call failed: ${error.message}`);
    }
}
const args = require('minimist')(process.argv.slice(2))

execute(args)


