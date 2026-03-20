import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConsentForm } from './consent-form';

interface PageProps {
  searchParams: Promise<{ authorization_id?: string }>;
}

export default async function ConsentPage({ searchParams }: PageProps) {
  const { authorization_id } = await searchParams;

  if (!authorization_id) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">Missing authorization_id parameter</p>
      </div>
    );
  }

  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError ?? !user) {
    // Redirect to login, preserving authorization_id
    const loginUrl = `/auth/login?next=/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}`;
    redirect(loginUrl);
  }

  // Fetch authorization details
  const { data: authDetails, error: authError } =
    await supabase.auth.oauth.getAuthorizationDetails(authorization_id);

  console.log('Authorization ID:', authorization_id);
  console.log('Auth details', authDetails);

  if (authError ?? !authDetails) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">
          Failed to load authorization details:{' '}
          {authError?.message ?? 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <ConsentForm
        authorizationId={authorization_id}
        clientName={authDetails.client?.name ?? 'Unknown Application'}
        scopes={authDetails.scope ? authDetails.scope.split(' ') : []}
        redirectUri={authDetails.redirect_url ?? ''}
      />
    </div>
  );
}
