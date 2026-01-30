import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Markdown from 'react-native-markdown-display'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
}

type ChatSession = {
  id: string
  title: string
  messages: Message[]
  updatedAt: number
}

const STORAGE_KEY = 'qa_chat_sessions'
const ACTIVE_KEY = 'qa_active_chat_id'
const STORAGE_MAX_MESSAGES = 50

export function QAScreen() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView | null>(null)

  const endpoint = useMemo(() => {
    const direct = process.env.EXPO_PUBLIC_QA_ENDPOINT
    const base = process.env.EXPO_PUBLIC_API_BASE_URL
    if (direct) return direct
    if (base) return `${base.replace(/\/$/, '')}/api/qa`
    return ''
  }, [])

  const mascot = `${(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ai-yobikou.vercel.app').replace(/\/$/, '')}/images/mascot.png`

  useEffect(() => {
    const load = async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      const active = await AsyncStorage.getItem(ACTIVE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ChatSession[]
        setSessions(parsed)
        const activeId = active || parsed[0]?.id || null
        setActiveChatId(activeId)
        const activeSession = parsed.find((s) => s.id === activeId) || parsed[0]
        setMessages(activeSession?.messages || [])
      } else {
        const initial: ChatSession = {
          id: Date.now().toString(),
          title: 'チャット 1',
          messages: [],
          updatedAt: Date.now(),
        }
        setSessions([initial])
        setActiveChatId(initial.id)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const save = async () => {
      if (!activeChatId) return
      const trimmed = messages.slice(-STORAGE_MAX_MESSAGES)
      setSessions((prev) =>
        prev.map((s) => (s.id === activeChatId ? { ...s, messages: trimmed, updatedAt: Date.now() } : s))
      )
    }
    save()
  }, [messages, activeChatId])

  useEffect(() => {
    if (sessions.length === 0) return
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    if (activeChatId) {
      AsyncStorage.setItem(ACTIVE_KEY, activeChatId)
    }
  }, [sessions, activeChatId])

  useEffect(() => {
    const loadAvatar = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('avatar_url').eq('user_id', user.id).single()
      if (data?.avatar_url) setUserAvatarUrl(data.avatar_url)
    }
    loadAvatar()
  }, [])

  const pickImage = async (useCamera = false) => {
    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (permission.status !== 'granted') {
        Alert.alert('権限が必要です', 'カメラへのアクセスを許可してください。')
        return
      }
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (permission.status !== 'granted') {
        Alert.alert('権限が必要です', '写真へのアクセスを許可してください。')
        return
      }
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8 })
    if (!result.canceled && result.assets[0]?.base64) {
      const asset = result.assets[0]
      const dataUrl = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
      setSelectedImage(dataUrl)
    }
  }

  const handleSend = async () => {
    if (loading) return
    if (!input.trim() && !selectedImage) return
    if (!endpoint) {
      Alert.alert('設定が必要です', 'QAエンドポイントを環境変数に設定してください。')
      return
    }
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      imageUrl: selectedImage || undefined,
    }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setSelectedImage(null)
    setLoading(true)

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
        imageUrl: m.imageUrl,
      }))
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          image: userMessage.imageUrl,
          history,
        }),
      })
      if (!response.ok) throw new Error('AIの応答に失敗しました')
      const data = await response.json()
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || '回答が取得できませんでした。',
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      Alert.alert('エラー', error?.message || '通信に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateChat = () => {
    const nextIndex = sessions.length + 1
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: `チャット ${nextIndex}`,
      messages: [],
      updatedAt: Date.now(),
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveChatId(newSession.id)
    setMessages([])
  }

  const handleDeleteChat = () => {
    if (!activeChatId) return
    Alert.alert('確認', 'このチャットを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const remaining = sessions.filter((s) => s.id !== activeChatId)
          const next = remaining[0]
          setSessions(remaining.length ? remaining : [])
          setActiveChatId(next?.id ?? null)
          setMessages(next?.messages ?? [])
        },
      },
    ])
  }

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)
  }, [messages])

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Q&A</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerIcon} onPress={handleCreateChat}>
              <Ionicons name="create-outline" size={18} color="#334155" />
            </Pressable>
            <Pressable style={styles.headerIcon} onPress={handleDeleteChat}>
              <Ionicons name="trash-outline" size={18} color="#334155" />
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Image source={{ uri: mascot }} style={styles.emptyMascot} />
              <Text style={styles.emptyTitle}>こんにちは。何でも聞いてください</Text>
              <Text style={styles.mutedText}>テキスト・画像どちらでもOKです</Text>
            </View>
          )}
          {messages.map((message) => {
            const isUser = message.role === 'user'
            return (
              <View key={message.id} style={[styles.messageRow, isUser && styles.messageRowUser]}>
                {!isUser && <Image source={{ uri: mascot }} style={styles.avatar} />}
                <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
                  {message.imageUrl && <Image source={{ uri: message.imageUrl }} style={styles.imagePreview} />}
                  {isUser ? (
                    <Text style={styles.userText}>{message.content}</Text>
                  ) : (
                    <Markdown style={markdownStyles}>{message.content}</Markdown>
                  )}
                </View>
                {isUser && (
                  <View style={styles.avatarCircle}>
                    {userAvatarUrl ? (
                      <Image source={{ uri: userAvatarUrl }} style={styles.avatar} />
                    ) : (
                      <Text style={styles.avatarPlaceholder}>U</Text>
                    )}
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>

        <View style={styles.inputBar}>
          {selectedImage && (
            <View style={styles.previewRow}>
              <Image source={{ uri: selectedImage }} style={styles.thumb} />
              <Pressable style={styles.removePreview} onPress={() => setSelectedImage(null)}>
                <Ionicons name="close" size={16} color="#334155" />
              </Pressable>
            </View>
          )}
          <View style={styles.inputRow}>
            <Pressable style={styles.iconButton} onPress={() => pickImage(false)}>
              <Ionicons name="image-outline" size={18} color="#334155" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => pickImage(true)}>
              <Ionicons name="camera-outline" size={18} color="#334155" />
            </Pressable>
            <TextInput
              style={styles.textInput}
              placeholder="メッセージを入力..."
              multiline
              value={input}
              onChangeText={setInput}
            />
            <Pressable
              style={[styles.sendButton, (!input.trim() && !selectedImage) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={loading || (!input.trim() && !selectedImage)}
            >
              <Ionicons name="paper-plane" size={18} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingTop: 12,
    backgroundColor: '#f7f7f8',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  messageList: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyMascot: {
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  mutedText: {
    fontSize: 12,
    color: '#64748b',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 16,
    padding: 12,
  },
  aiBubble: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  userBubble: {
    backgroundColor: '#e2e8f0',
  },
  userText: {
    color: '#0f172a',
    fontSize: 14,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholder: {
    fontSize: 10,
    color: '#64748b',
  },
  imagePreview: {
    width: 160,
    height: 120,
    borderRadius: 10,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 16,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#f8fafc',
    textAlignVertical: 'top',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  removePreview: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#4b8bff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
})

const markdownStyles = {
  body: { color: '#0f172a', fontSize: 14 },
  heading2: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  paragraph: { marginTop: 6 },
  list_item: { marginVertical: 4 },
}
