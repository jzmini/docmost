import AccountNameForm from "@/features/user/components/account-name-form";
import ChangeEmail from "@/features/user/components/change-email";
import ChangePassword from "@/features/user/components/change-password";
import { Divider } from "@mantine/core";
import AccountAvatar from "@/features/user/components/account-avatar";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { AccountMfaSection } from "@/features/user/components/account-mfa-section";
import useCurrentUser from "@/features/user/hooks/use-current-user";

export default function AccountSettings() {
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();

  return (
    <>
      <Helmet>
        <title>
          {t("My Profile")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("My Profile")} />

      <AccountAvatar />

      <AccountNameForm />

      <Divider my="lg" />

      <ChangeEmail />

      {/* Only show password change for non-LDAP users */}
      {/* LDAP users should change passwords through their LDAP/Active Directory system */}
      {!currentUser?.user?.isLdapUser && (
        <>
          <Divider my="lg" />
          <ChangePassword />
        </>
      )}

      <Divider my="lg" />

      <AccountMfaSection />
    </>
  );
}
