import { Alert, Linking, Platform } from 'react-native';

const SUPPORT_EMAIL = 'expiryx5@gmail.com';
const SUPPORT_SUBJECT = 'Support request – ExpiryX';
const SUPPORT_BODY = 'Hi,\n\nI need help with the app. Details:\n';

const buildMailtoUrl = () => {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    SUPPORT_SUBJECT
  )}&body=${encodeURIComponent(SUPPORT_BODY)}`;
};

const buildGmailUrl = () => {
  // Gmail URL scheme documentation:
  // googlegmail://co?to=<email>&subject=<subject>&body=<body>
  return `googlegmail://co?to=${encodeURIComponent(
    SUPPORT_EMAIL
  )}&subject=${encodeURIComponent(SUPPORT_SUBJECT)}&body=${encodeURIComponent(
    SUPPORT_BODY
  )}`;
};

const tryOpenGmail = async (): Promise<boolean> => {
  const gmailUrl = buildGmailUrl();
  try {
    const canOpen = await Linking.canOpenURL(gmailUrl);
    if (canOpen) {
      await Linking.openURL(gmailUrl);
      return true;
    }
  } catch (e) {
    console.log('[Support] Failed to open Gmail', e);
  }
  return false;
};

const tryOpenMailto = async (): Promise<boolean> => {
  const mailtoUrl = buildMailtoUrl();
  try {
    const canOpen = await Linking.canOpenURL(mailtoUrl);
    if (canOpen) {
      await Linking.openURL(mailtoUrl);
      return true;
    }
  } catch (e) {
    console.log('[Support] Failed to open mailto', e);
  }
  return false;
};

export const handleContactSupport = async () => {
  try {
    // 1) Prefer Gmail app if available
    const openedGmail = await tryOpenGmail();
    if (openedGmail) {
      return;
    }

    // 2) Fallback to generic mailto:
    const openedMailto = await tryOpenMailto();
    if (openedMailto) {
      return;
    }

    // 3) Last resort: show email in an alert
    Alert.alert(
      'לא ניתן לפתוח אימייל',
      'לא הצלחתי לפתוח אפליקציית מייל במכשיר. אפשר לפנות אלינו ישירות לכתובת: expiryx5@gmail.com'
    );
  } catch (error) {
    console.log('[Support] Error opening support email', error);
    Alert.alert(
      'שגיאה',
      'לא הצלחנו לפתוח מייל כרגע. נסה שוב מאוחר יותר או שלח ישירות לכתובת: expiryx5@gmail.com'
    );
  }
};


