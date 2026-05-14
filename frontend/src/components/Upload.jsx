import { useState, useRef } from "react";

export default function Upload({ onFileUpload }) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = (file) => {
    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      alert("Please upload a valid CSV file.");
      return;
    }
    setFileName(file.name);
    
    // SAFE FALLBACK: Only run the upload if the parent component passed the function
    if (typeof onFileUpload === 'function') {
      onFileUpload(file);
    } else {
      console.warn("Upload component is not connected to App.jsx yet!");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-8">
      <div
        className={`relative group flex flex-col items-center justify-center w-full h-64 p-6 border-2 border-dashed rounded-3xl transition-all duration-300 ease-in-out ${
          isDragging
            ? "border-indigo-500 bg-indigo-50/50 scale-[1.02]"
            : "border-gray-300 bg-white hover:border-indigo-400 hover:bg-gray-50"
        } shadow-sm backdrop-blur-md`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />

        <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
          <div className={`p-4 rounded-full transition-colors duration-300 ${isDragging ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold text-gray-700">
              {fileName ? (
                <span className="text-indigo-600">{fileName}</span>
              ) : (
                "Drag and drop your CSV file here"
              )}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              or <button type="button" onClick={() => fileInputRef.current.click()} className="text-indigo-500 font-medium hover:text-indigo-600 hover:underline pointer-events-auto transition-colors">click to browse</button>
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Maximum size: 50MB
          </div>
        </div>
      </div>
    </div>
  );
}

