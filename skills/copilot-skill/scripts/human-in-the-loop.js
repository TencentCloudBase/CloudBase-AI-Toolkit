async function execute(args) {
    const {
        envId,
        token,
        threadId,
        interruptId,
        action,
        message,
        model = 'kimi,kimi-k2-instruct-local',
    } = args;

    // Validate required parameters
    if (!envId) {
        throw new Error('envId parameter is required');
    }

    if (!token) {
        throw new Error('token parameter is required');
    }

    if (!message) {
        throw new Error('message parameter is required');
    }

    if (!action) {
        throw new Error('action parameter is required');
    }

    if (!threadId) {
        throw new Error('threadId parameter is required');
    }

    if (!interruptId) {
        throw new Error('interruptId parameter is required');
    }

    // Validate model parameter
    const supportedVendors = ['kimi', 'deepseek'];
    const vendor = model.split(',')[0];
    if (!supportedVendors.includes(vendor)) {
        throw new Error(`Unsupported model vendor: ${vendor}. Supported vendors: ${supportedVendors.join(', ')}`);
    }

    // Build request URL
    const baseUrl = `https://${envId}.api.tcloudbasegateway.com`;
    const apiUrl = `${baseUrl}/v1/aibot/copilot/send-message`;

    // Build request body
    const requestBody = {
        threadId: threadId,
        messages: [],
        forwardedProps:{
            resume: {
                interruptId: interruptId,
                payload: {
                    action: action,
                    result: message,
                }
            }
        },
        model: model
    };

    // Send request with stream support
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        // Handle Server-Sent Events (SSE) stream
        if (!response.body) {
            throw new Error('Response body is not available for streaming');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponseList = [];
        let toolCallList = [];

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                // Process SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6); // Remove 'data: ' prefix
                        if (data.trim() === '[DONE]') {
                            break;
                        }

                        try {
                            console.log(data)
                            const parsedData = JSON.parse(data);
                            if (parsedData.type === "TOOL_CALL_START"){
                                toolCallList.push(parsedData?.toolCallName)
                            }
                            fullResponseList.push(parsedData);
                        } catch (parseError) {
                            // Skip invalid JSON data
                            continue;
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        console.log(toolCallList)

        return {
            contents: fullResponseList,
            toolCallList: toolCallList,
            threadId: threadId,
            model: model,
            isStreamed: true
        };

    } catch (error) {
        throw new Error(`Copilot API call failed: ${error.message}`);
    }
}
const args = require('minimist')(process.argv.slice(2))

execute(args)


