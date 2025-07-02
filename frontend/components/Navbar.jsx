// src/components/Navbar.jsx
import React from 'react';
// import { MessageSquareText, Menu } from 'lucide-react';

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        {/* <MessageSquareText size={28} color="#4ecca3" /> */}
        <span>WA Sender</span>
      </div>
      <div className="navbar-menu">
        <button className="nav-button">Dashboard</button>
        <button className="nav-button active">Send Messages</button>
        <button className="nav-button">History</button>
        <button className="nav-button">Settings</button>
      </div>
      <div className="navbar-actions">
        <button className="sign-in-button">Sign In</button>
        <button className="menu-button">
          {/* <Menu size={24} /> */}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;