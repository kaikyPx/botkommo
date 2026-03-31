import { api } from './kommo';

async function getUsers() {
    try {
        const response = await api.get('/api/v4/users');
        console.log(JSON.stringify(response.data._embedded?.users, null, 2));
    } catch (error: any) {
        console.error('Error fetching users:', error.message);
    }
}

getUsers();
