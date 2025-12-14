# Business Code Cleanup Guide

## Migration Status

The app has been refactored from a business-centric model to an owner/collaborator model. The following files and features still reference the old business model and should be removed or updated:

## Files to Remove/Deprecate

### Screens (can be removed):
- `app/settings/business.tsx` - Business info settings (replaced by profile settings)
- `app/settings/employees.tsx` - Employee management (replaced by collaborations - future feature)
- `app/join-business.tsx` - Join business screen (replaced by collaboration invitations - future feature)

### Hooks (can be removed):
- `src/lib/hooks/useBusiness.ts` - Replaced by `useActiveOwner`

### Mutations (can be removed):
- `src/lib/supabase/mutations/businesses.ts` - All business mutations
- `src/lib/supabase/mutations/employees.ts` - Employee mutations (replaced by collaborations)

### Queries (can be removed):
- `src/lib/supabase/queries/employees.ts` - Employee queries

### Settings Screens (need update):
- `app/settings/notifications.tsx` - Update to use profile/owner settings instead of business
- `app/settings/auto-delete.tsx` - Update to use profile/owner settings instead of business

## Database Tables (DO NOT DROP YET)

The following tables are still referenced in some legacy code but should NOT be dropped yet:
- `public.businesses` - Still used by notification_sent_log
- `public.business_users` - Still used for backward compatibility in notifications

These will be removed in a future migration once notification_sent_log is updated to use owner_id.

## Next Steps

1. Run the migration: `docs/migrations/add_owner_id_to_products_and_locations.sql`
2. Update notification settings to store in profiles table
3. Remove deprecated screens and hooks
4. Update notification_sent_log table to use owner_id
5. Drop businesses and business_users tables (final step)

