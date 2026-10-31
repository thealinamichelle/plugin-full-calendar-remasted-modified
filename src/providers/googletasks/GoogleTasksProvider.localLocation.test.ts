import { GoogleTasksProvider } from './GoogleTasksProvider';
import FullCalendarPlugin from '../../main';
import { makeAuthenticatedRequest } from '../google/auth/request';

jest.mock('../google/auth/request', () => ({
  makeAuthenticatedRequest: jest.fn()
}));
jest.mock('../google/auth/GoogleAuthManager', () => ({
  GoogleAuthManager: jest.fn().mockImplementation(() => ({
    getTokenForSource: jest.fn().mockResolvedValue('token')
  }))
}));

describe('Google Tasks event is independent from Obsidian note location', () => {
  it('does not assign a vault file location even when a note is linked', async () => {
    const provider = new GoogleTasksProvider(
      { id: 'list-source', name: 'School', listId: 'list-1', googleAccountId: 'account-1' },
      { app: {} } as FullCalendarPlugin
    );
    (makeAuthenticatedRequest as jest.Mock).mockResolvedValueOnce({
      items: [{ id: 'task-123', title: 'Paper', due: '2026-10-27T00:00:00Z', status: 'needsAction' }]
    });
    const events = await provider.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0][0].uid).toBe('task-123');
    expect(events[0][1]).toBeNull();
  });
});
