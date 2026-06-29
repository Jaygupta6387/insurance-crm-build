import React, { useCallback, useState } from 'react';

interface FileUploadProps {
  label: string;
  name: string;
  accept?: string;
  maxSize?: number; // in MB
  value?: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  required?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  name,
  accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx',
  maxSize = 10,
  value,
  onChange,
  error,
  required = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSize) {
      return `File size must be less than ${maxSize}MB`;
    }
    return null;
  };

  const handleFileSelect = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      alert(validationError);
      return;
    }
    onChange(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }, [maxSize, onChange]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleRemove = useCallback(() => {
    onChange(null);
    setPreview(null);
  }, [onChange]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging
            ? 'border-primary-500 bg-primary-50'
            : error
            ? 'border-red-300 bg-red-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
        }`}
      >
        {value ? (
          <div className="space-y-3">
            {preview ? (
              <div className="flex justify-center">
                <img src={preview} alt="Preview" className="max-h-32 rounded-lg" />
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl">📄</span>
                <div className="text-left">
                  <p className="font-medium text-gray-900">{value.name}</p>
                  <p className="text-sm text-gray-500">{formatFileSize(value.size)}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleRemove}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Remove File
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl mb-2">📤</div>
            <p className="text-sm text-gray-600">
              Drag and drop a file here, or{' '}
              <label htmlFor={name} className="text-primary-600 hover:text-primary-800 cursor-pointer font-medium">
                browse
              </label>
            </p>
            <p className="text-xs text-gray-500">
              Accepted: {accept} (Max {maxSize}MB)
            </p>
            <input
              type="file"
              id={name}
              name={name}
              accept={accept}
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        )}
      </div>
      
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

