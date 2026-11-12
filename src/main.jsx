import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import SiteUpdatePrompt from './SiteUpdatePrompt.jsx';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><SiteUpdatePrompt/><App/></React.StrictMode>);
