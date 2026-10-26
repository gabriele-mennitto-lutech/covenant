import axios from 'axios';

const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';

export async function logActivity(username: string, action: string, targetType: string, targetId: string, details?: any) {
    try {
        await axios.post(`${DATASERVICE_URL}/data/logs`, {
            username,
            action,
            target_type: targetType,
            target_id: targetId,
            details
        });
    } catch (err) {
        console.error('Failed to log activity:', err);
    }
}
