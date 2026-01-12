/**
 * Manual test - add this code temporarily to a screen to trigger enforcePlanLimit
 * For example, add a button in the home screen that calls this function
 */

import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { enforcePlanLimitAfterCreate } from '@/lib/supabase/mutations/items';

// In your component:
const { activeOwnerId } = useActiveOwner();

// Add a button:
<Button onPress={async () => {
    console.log('[Manual Test] Calling enforcePlanLimitAfterCreate...');
    await enforcePlanLimitAfterCreate(activeOwnerId);
    console.log('[Manual Test] Done!');
}}>
    Test Plan Limits
</Button>
