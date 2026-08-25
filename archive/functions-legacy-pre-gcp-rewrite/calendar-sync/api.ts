import { Request, Response } from 'express';
import { pauseSync, resumeSync, stopSync, restartSync, clearUserData } from './control';
import cors from 'cors';

/**
 * Main API Gateway Function - Routes requests to appropriate handlers
 */
export const api = async (req: Request, res: Response): Promise<void> => {
    // Enable CORS for all origins (configure more restrictively in production)
    const corsHandler = cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    });

    // Apply CORS
    await new Promise<void>((resolve, reject) => {
        corsHandler(req, res, (err: any) => {
            if (err) reject(err);
            else resolve();
        });
    });

    try {
        const path = req.path || req.url;
        const method = req.method;

        console.log(`API Gateway: ${method} ${path}`);

        // Control endpoints (OAuth and setup now handled by Next.js)
        if (path === '/sync/pause' && method === 'POST') {
            return await pauseSync(req, res);
        }

        if (path === '/sync/resume' && method === 'POST') {
            return await resumeSync(req, res);
        }

        if (path === '/sync/stop' && method === 'POST') {
            return await stopSync(req, res);
        }

        if (path === '/sync/restart' && method === 'POST') {
            return await restartSync(req, res);
        }

        if (path === '/user/clear' && method === 'DELETE') {
            return await clearUserData(req, res);
        }

        // Health check
        if (path === '/health' && method === 'GET') {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
            return;
        }

        // 404 for unknown routes
        res.status(404).json({
            error: 'Not Found',
            path,
            method,
            message: 'API endpoint not found'
        });

    } catch (error) {
        console.error('API Gateway error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred'
        });
    }
};