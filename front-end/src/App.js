import React from "react";
import MultiLineChart from "./components/Dashboard"
import { Provider } from './components/ui/provider';

function App() {
  return (
    <Provider>
    <div>
      <MultiLineChart></MultiLineChart>
    </div>
    </Provider>
  );
}

export default App;
