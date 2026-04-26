import React, { useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
}

export function FileUpload({ 
  onFileSelect, 
  accept = 'application/pdf', 
  maxSize = 10 * 1024 * 1024,
  className 
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted');
      return;
    }
    if (file.size > maxSize) {
      setError('File exceeds 10MB limit');
      return;
    }
    setError(null);
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'border-2 border-dashed rounded-card p-12 bg-background transition-all duration-200',
          isDragging ? 'border-primary bg-card' : 'border-border hover:border-accent hover:bg-card/50',
          error && 'border-red-500',
          selectedFile && 'border-accent bg-card'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          id="file-upload"
          disabled={!!selectedFile}
        />
        
        {!selectedFile ? (
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
            <UploadCloud size={48} className="text-muted" />
            <p className="text-secondary">Drag & drop or click to upload</p>
            <p className="text-muted text-sm">PDF only, max 10MB</p>
          </label>
        ) : (
          <div className="flex items-center justify-between p-4 bg-background rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <UploadCloud size={24} className="text-accent" />
              </div>
              <div>
                <p className="text-primary font-medium">{selectedFile.name}</p>
                <p className="text-muted text-sm">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <button
              onClick={handleRemove}
              className="p-2 hover:bg-primary/5 rounded-lg transition-colors"
            >
              <X size={20} className="text-muted" />
            </button>
          </div>
        )}
      </div>
      
      {error && !selectedFile && (
        <p className="text-red-500 text-sm mt-4 text-center">{error}</p>
      )}
    </div>
  );
}
