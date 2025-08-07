import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve the HTML file directly at root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });

  // API endpoint to provide database configuration
  app.get('/api/config', (req, res) => {
    res.json({
      supabase: {
        url: process.env.DATABASE_URL || 'https://uuorqbugdhfoikylbxdz.supabase.co',
        key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1b3JxYnVnZGhmb2lreWxieGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MzQ4NDcsImV4cCI6MjA3MDAxMDg0N30.-d7xjLnyFVoVKbruKhVJthHYCFUkkrWlwijDbrKdye4',
        enabled: true
      }
    });
  });

  // API endpoint for health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: !!process.env.DATABASE_URL 
    });
  });

  const httpServer = createServer(app);

  return httpServer;
}
