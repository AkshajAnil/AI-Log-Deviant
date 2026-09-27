import React from 'react';
import DeviationForm from './components/Form/DeviationForm';
import AIPanel from './components/AIAssistant/AIPanel';
import { Layers } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xl">
            <Layers className="w-6 h-6" />
            <span>AIVOA</span>
          </div>
          <nav className="flex gap-6 text-sm font-medium text-gray-500">
            <a href="#" className="hover:text-gray-900">QMS</a>
            <a href="#" className="hover:text-gray-900">Dashboard</a>
            <a href="#" className="text-blue-600 border-b-2 border-blue-600 pb-4 -mb-4">Deviations</a>
            <a href="#" className="hover:text-gray-900">CAPAs</a>
            <a href="#" className="hover:text-gray-900">Change Control</a>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="border border-gray-200 rounded-md px-3 py-1.5 flex items-center gap-2">
            <Layers className="w-4 h-4 text-gray-400" />
            <span className="font-medium">Vasudha Pharma Chem Limited</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
          <div className="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xs">
            MH
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 flex flex-col lg:flex-row max-w-[1400px] mx-auto w-full items-start gap-0">
        <DeviationForm />
        <AIPanel />
      </main>
    </div>
  );
}

export default App;
