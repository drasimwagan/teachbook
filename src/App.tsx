import { useState } from "react";
import ConceptPane from "./components/ConceptPane";
import VisualizationPane from "./components/VisualizationPane";
import ChatPane from "./components/ChatPane";
import StepControls from "./components/StepControls";
import type { Notebook } from "./types";
import "./App.css";

function App() {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Teachbook</span>
          <span className="text-xs text-zinc-500">
            {notebook?.metadata.title ?? "No notebook loaded"}
          </span>
        </div>
        <StepControls
          currentStep={currentStep}
          totalSteps={notebook?.totalSteps ?? 0}
          onStep={setCurrentStep}
        />
      </header>

      <main className="grid flex-1 grid-cols-[1fr_1fr_360px] overflow-hidden">
        <ConceptPane notebook={notebook} onChange={setNotebook} />
        <VisualizationPane notebook={notebook} currentStep={currentStep} />
        <ChatPane notebook={notebook} />
      </main>
    </div>
  );
}

export default App;
