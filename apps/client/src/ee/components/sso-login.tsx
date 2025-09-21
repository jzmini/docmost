import { useState } from "react";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { Button, Divider, Stack } from "@mantine/core";
import { IconLock, IconServer } from "@tabler/icons-react";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import { buildSsoLoginUrl } from "@/ee/security/sso.utils.ts";
import { SSO_PROVIDER } from "@/ee/security/contants.ts";
import { GoogleIcon } from "@/components/icons/google-icon.tsx";
import { LdapLoginModal } from "@/ee/components/ldap-login-modal.tsx";

export default function SsoLogin() {
  console.log('SsoLogin component rendering');
  const { data, isLoading } = useWorkspacePublicDataQuery();
  const [ldapModalOpened, setLdapModalOpened] = useState(false);
  const [selectedLdapProvider, setSelectedLdapProvider] = useState<IAuthProvider | null>(null);

  console.log('SsoLogin - data:', data);
  console.log('SsoLogin - isLoading:', isLoading);
  console.log('SsoLogin - authProviders:', data?.authProviders);

  if (!data?.authProviders || data?.authProviders?.length === 0) {
    console.log('SsoLogin - returning null, no auth providers');
    return null;
  }

  const handleSsoLogin = (provider: IAuthProvider) => {
    if (provider.type === SSO_PROVIDER.LDAP) {
      // Open modal for LDAP instead of redirecting
      setSelectedLdapProvider(provider);
      setLdapModalOpened(true);
    } else {
      // Redirect for other SSO providers
      window.location.href = buildSsoLoginUrl({
        providerId: provider.id,
        type: provider.type,
        workspaceId: data.id,
      });
    }
  };

  const getProviderIcon = (provider: IAuthProvider) => {
    if (provider.type === SSO_PROVIDER.GOOGLE) {
      return <GoogleIcon size={16} />;
    } else if (provider.type === SSO_PROVIDER.LDAP) {
      return <IconServer size={16} />;
    } else {
      return <IconLock size={16} />;
    }
  };

  return (
    <>
      {selectedLdapProvider && (
        <LdapLoginModal
          opened={ldapModalOpened}
          onClose={() => {
            setLdapModalOpened(false);
            setSelectedLdapProvider(null);
          }}
          provider={selectedLdapProvider}
          workspaceId={data.id}
        />
      )}

      {data.authProviders.length > 0 && (
        <>
          <Stack align="stretch" justify="center" gap="sm">
            {data.authProviders.map((provider, index) => {
              // For LDAP providers, show a more descriptive name if they all have the same name
              const ldapCount = data.authProviders.filter(p => p.type === SSO_PROVIDER.LDAP).length;
              const ldapIndex = data.authProviders.slice(0, index + 1).filter(p => p.type === SSO_PROVIDER.LDAP).length;
              const displayName = provider.type === SSO_PROVIDER.LDAP && ldapCount > 1 && provider.name === 'LDAP' 
                ? `${provider.name} ${ldapIndex}` 
                : provider.name;
                
              return (
                <div key={provider.id}>
                  <Button
                    onClick={() => handleSsoLogin(provider)}
                    leftSection={getProviderIcon(provider)}
                    variant="default"
                    fullWidth
                  >
                    {displayName}
                  </Button>
                </div>
              );
            })}
          </Stack>

          {!data.enforceSso && (
            <Divider my="xs" label="OR" labelPosition="center" />
          )}
        </>
      )}
    </>
  );
}
