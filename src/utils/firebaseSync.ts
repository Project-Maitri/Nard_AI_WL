import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';

export const fetchUserData = async (userId: string) => {
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }
  return null;
};

export const syncUserData = async (userId: string, data: any) => {
  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
};

export const fetchUserChats = async (userId: string) => {
  try {
    const chatsRef = collection(db, 'users', userId, 'chats');
    const querySnapshot = await getDocs(chatsRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${userId}/chats`);
  }
  return [];
};

export const syncUserChats = async (userId: string, chats: any[]) => {
  try {
    for (const chat of chats) {
      const chatRef = doc(db, 'users', userId, 'chats', chat.id);
      await setDoc(chatRef, {
        userId: userId,
        title: chat.title,
        messages: chat.messages,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/chats`);
  }
};
