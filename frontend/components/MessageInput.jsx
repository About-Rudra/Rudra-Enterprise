// src/components/MessageInput.jsx
import React from 'react';

const MessageInput = ({ value, onChange }) => {
  return (
    <div className="message-input">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your message here..."
        rows={6}
      />
      <div className="message-input-footer">
        <span className="character-count">
          {value.length} characters
        </span>
        <div className="message-tags">
          <button className="tag-button">Add Name</button>
          <button className="tag-button">Add Variable</button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;