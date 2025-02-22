import React, { useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";

const WebSocketChart = () => {
    const [numCurves, setNumCurves] = useState(10);
    const [forceData, setForceData] = useState([]);
    const socket = new WebSocket("ws://localhost:8000/ws/data");

    useEffect(() => {
        socket.onopen = () => {
            console.log("WebSocket connected.");
            requestData(numCurves);  // Request initial data
        };

        socket.onmessage = (event) => {
            const response = JSON.parse(event.data);
            if (response.status === "success") {
                setForceData(response.data);
            } else {
                console.error("Error:", response.message);
            }
        };

        return () => {
            socket.close();
        };
    }, []);

    const requestData = (num) => {
        socket.send(JSON.stringify({ num_curves: num }));
    };

    return (
        <div>
            <h2>Force vs Z (Live)</h2>
            <input
                type="range"
                min="1"
                max="100"
                value={numCurves}
                onChange={(e) => {
                    const newNum = Number(e.target.value);
                    setNumCurves(newNum);
                    requestData(newNum);
                }}
            />
            <span>{numCurves} Curves</span>
            <ReactECharts 
                option={{
                    title: { text: "Force vs Z", left: "center" },
                    xAxis: { type: "value", name: "Z" },
                    yAxis: { type: "value", name: "Force" },
                    series: forceData.map((curve, index) => ({
                        name: `Curve ${index + 1}`,
                        type: "line",
                        smooth: true,
                        showSymbol: false,
                        data: curve.x.map((z, i) => [z, curve.y[i]]),
                    })),
                    legend: { show: true, bottom: 0 },
                    grid: { left: "10%", right: "10%", bottom: "15%" },
                    animation: false, // Prevents lag when updating chart
                }}
                style={{ height: 400 }}
                notMerge={true}
            />
        </div>
    );
};

export default WebSocketChart;
