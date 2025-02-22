const socket = new WebSocket("ws://localhost:8000/ws/data");

socket.onopen = () => {
    console.log("WebSocket connected.");
};

socket.onmessage = (event) => {
    const response = JSON.parse(event.data);
    if (response.status === "success") {
        console.log("New data received:", response.data);
        updateChart(response.data);
    } else {
        console.error("Error:", response.message);
    }
};

socket.onclose = () => {
    console.log("WebSocket disconnected.");
};

function updateChart(data) {
    console.log("Updating visualization with data:", data);
}
