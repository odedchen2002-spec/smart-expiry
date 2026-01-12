-- Create RLS policy that allows enforce_plan_limits function to update
-- This works by setting a session variable in the function that the policy checks

-- First, create the policy that checks for the session variable
CREATE POLICY "Allow enforce_plan_limits function to update locks"
ON items
FOR UPDATE
TO authenticated
USING (
  -- Allow if this is the enforce_plan_limits function (via session var)
  -- OR if user is the owner
  current_setting('app.enforce_plan_limits', true) = 'true' 
  OR owner_id = auth.uid()
)
WITH CHECK (
  current_setting('app.enforce_plan_limits', true) = 'true'
  OR owner_id = auth.uid()
);
