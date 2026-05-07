import React, { useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, getDocs, collection } from 'firebase/firestore';

interface FirebaseSyncProps {
  theme: string;
  uiLang: string;
  userName: string;
  premiumVoice: string;
  speechRate: number;
  freeTrialEnd: number | null;
  subscriptionStatus: string;
  savedChats: any[];
  setTheme: (t: any) => void;
  setUiLang: (l: any) => void;
  setUserName: (n: any) => void;
  setPremiumVoice: (v: any) => void;
  setSpeechRate: (r: any) => void;
  setFreeTrialEnd: (e: any) => void;
  setSubscriptionStatus: (s: any) => void;
  setSavedChats: (c: any) => void;
}

export const FirebaseSync: React.FC<FirebaseSyncProps> = ({
  theme, uiLang, userName, premiumVoice, speechRate, freeTrialEnd, subscriptionStatus, savedChats,
  setTheme, setUiLang, setUserName, setPremiumVoice, setSpeechRate, setFreeTrialEnd, setSubscriptionStatus, setSavedChats
}) => {
  const currentUserRef = useRef<User | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      currentUserRef.current = user;
      if (user) {
        try {
          const globalRef = doc(db, 'global_config', 'main');
          const globalSnap = await getDoc(globalRef);
          if (globalSnap.exists()) {
              const d = globalSnap.data();
              localStorage.setItem("nard_global_config", JSON.stringify({
                  businessName: d.businessName,
                  paymentUpi: d.paymentUpi,
                  pricingBasic: d.pricingBasic,
                  pricingPro: d.pricingPro,
                  pricingUltra: d.pricingUltra,
              }));
          }
        } catch(e) {}

        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.theme) setTheme(data.theme);
            if (data.uiLang) setUiLang(data.uiLang);
            if (data.userName) setUserName(data.userName);
    if (data.premiumVoice) setPremiumVoice(data.premiumVoice);
            if (data.speechRate) setSpeechRate(data.speechRate);
            if (data.trialEnd) setFreeTrialEnd(data.trialEnd);
            if (data.subscriptionStatus) setSubscriptionStatus(data.subscriptionStatus);
          }
        } catch(e) {}

        try {
          const chatsRef = collection(db, 'users', user.uid, 'chats');
          const querySnapshot = await getDocs(chatsRef);
          const chats = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          if (chats.length > 0) {
            setSavedChats((prev: any) => {
              // Merge chats or replace
              const newChats = [...prev];
              chats.forEach(c => {
                if (!newChats.find(nc => nc.id === c.id)) {
                  newChats.push(c);
                }
              });
              return newChats;
            });
          }
        } catch(e) {}
      }
    });

    return () => unsubscribe();
  }, [setFreeTrialEnd, setPremiumVoice, setSavedChats, setSpeechRate, setSubscriptionStatus, setTheme, setUiLang, setUserName]);

  // Sync user profile
  useEffect(() => {
    if (initialLoadRef.current) {
        return;
    }
    if (currentUserRef.current) {
      const userRef = doc(db, 'users', currentUserRef.current.uid);
      setDoc(userRef, {
        theme,
        uiLang,
        userName,
        premiumVoice,
        speechRate,
        trialEnd: freeTrialEnd,
        subscriptionStatus,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(console.error);
    }
  }, [theme, uiLang, userName, premiumVoice, speechRate, freeTrialEnd, subscriptionStatus]);

  // Sync chats
  useEffect(() => {
     if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
     }

     if (currentUserRef.current && savedChats.length > 0) {
         savedChats.forEach(chat => {
             const chatRef = doc(db, 'users', currentUserRef.current!.uid, 'chats', chat.id);
             setDoc(chatRef, {
                 userId: currentUserRef.current!.uid,
                 title: chat.title,
                 messages: chat.messages,
                 updatedAt: serverTimestamp(),
                 createdAt: serverTimestamp() // Set createdAt if it's new
             }, { merge: true }).catch(console.error);
         });
     }
  }, [savedChats]);

  return null;
};
