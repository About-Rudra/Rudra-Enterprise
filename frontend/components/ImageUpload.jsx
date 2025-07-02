// src/components/ImageUpload.jsx
import React, { useRef } from 'react';
import { Upload, X } from 'lucide-react';

const ImageUpload = ({ images, onUpload, onRemove }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const validImageFiles = files.filter(file => file.type.startsWith('image/'));
    onUpload(validImageFiles);
    // Reset file input
    e.target.value = null;
  };

  return (
    <div className="image-upload">
      <div className="image-preview-container">
        {images.map((image, index) => (
          <div key={index} className="image-preview">
            <img src={URL.createObjectURL(image)} alt={`Preview ${index}`} />
            <button 
              className="remove-image-button"
              onClick={() => onRemove(index)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
        
        <div 
          className="upload-image-button"
          onClick={() => fileInputRef.current.click()}
        >
          <Upload size={24} />
          <span>Add Image</span>
        </div>
      </div>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
        multiple
      />
      
      <p className="upload-hint">
        {images.length === 0 
          ? 'Upload images to send with your message' 
          : `${images.length} image${images.length !== 1 ? 's' : ''} selected`}
      </p>
    </div>
  );
};

export default ImageUpload;