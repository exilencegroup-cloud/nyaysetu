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
          'border-2 border-dashed rounded-card p-4 sm:p-8 md:p-12 bg-background transition-all duration-200',
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
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
            <UploadCloud size={36} className="text-muted" />
            <p className="text-secondary text-xs sm:text-sm md:text-base text-center px-2">Drag & drop or click to upload</p>
            <p className="text-muted text-xs sm:text-sm">PDF only, max 10MB</p>
          </label>
        ) : (
          <div className="flex items-center justify-between p-3 sm:p-4 bg-background rounded-lg">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-accent/10 rounded-lg flex-shrink-0">
                <UploadCloud size={20} className="text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-primary font-medium text-xs sm:text-sm truncate">{selectedFile.name}</p>
                <p className="text-muted text-xs">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <button
              onClick={handleRemove}
              className="p-2 hover:bg-primary/5 rounded-lg transition-colors flex-shrink-0"
            >
              <X size={18} className="text-muted" />
            </button>
          </div>
        )}
      </div>
      
      {error && !selectedFile && (
        <p className="text-red-500 text-xs sm:text-sm mt-4 text-center">{error}</p>
      )}
    </div>
  );
}
