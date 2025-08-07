# Staff Roster Management System

## Overview

This is a comprehensive staff roster management system built for Shriajj Pty Ltd. The application has been successfully converted from React to pure HTML/JavaScript while maintaining all functionality, real-time capabilities, and Supabase integration. The system provides employee scheduling capabilities with multi-location support, user authentication, and data synchronization.

The application manages employee schedules across multiple locations (Caroline Springs, Werribee Plaza, Point Cook, Geelong, Woodgrove) and supports role-based access control for administrators, managers, and supervisors. It features real-time data synchronization via Supabase, offline capabilities with local storage fallback, and a responsive design optimized for both desktop and mobile devices.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Pure HTML5/CSS3/JavaScript (ES6+) - Converted from React while maintaining all functionality
- **UI Components**: Custom CSS components with utility classes for consistent styling and responsive design
- **Styling**: Custom CSS with CSS variables for theming, responsive design, and mobile-first approach
- **State Management**: Vanilla JavaScript object-based state management with localStorage persistence
- **Form Handling**: Native HTML5 forms with custom validation and event handling
- **Icons**: Lucide Icons via CDN for consistent iconography
- **Real-time Updates**: Direct Supabase client integration for live data synchronization
- **Responsive Design**: Mobile-first CSS with media queries and flexible grid layouts

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules for modern JavaScript features
- **API Design**: Minimal REST API for configuration and health checks
- **Middleware**: Custom logging, JSON parsing, and error handling middleware
- **Development**: Vite integration for development server and static file serving

### Data Storage Solutions
- **Primary Database**: Supabase (PostgreSQL) for cloud-hosted real-time database
- **Real-time Sync**: Supabase real-time subscriptions for live data updates across devices
- **Offline Support**: Browser localStorage for offline caching and user preferences with automatic sync
- **Data Backup**: Dual storage strategy - cloud-first with local fallback for reliability

### Authentication and Authorization
- **Session-based Authentication**: Secure session management with role-based access control
- **User Roles**: Three-tier system (admin, manager, supervisor) with different permission levels
- **Password Security**: Hashed password storage with secure session cookies
- **Route Protection**: Middleware-based route protection for API endpoints

### External Dependencies
- **Database Hosting**: Supabase for PostgreSQL hosting with real-time capabilities and built-in authentication
- **UI Icons**: Lucide Icons library for consistent iconography across the application
- **Real-time Features**: Supabase JavaScript client for real-time subscriptions and data synchronization
- **Fonts**: Google Fonts (Inter) for modern typography
- **Development Tools**: Node.js/Express for minimal backend API, Vite for development server

The architecture follows a simplified, performant approach with direct database connections and minimal external dependencies. The system maintains real-time capabilities through Supabase while being accessible on any device with a modern web browser. The conversion from React to vanilla HTML/JavaScript eliminates build complexity while preserving all functionality and improving loading performance.