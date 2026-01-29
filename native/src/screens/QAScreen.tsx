import React, { useMemo, useState } from 'react'
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  imageUri?: string
  imageDataUrl?: string
}

export function QAScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const endpoint = useMemo(() => {
    const direct = process.env.EXPO_PUBLIC_QA_ENDPOINT
    const base = process.env.EXPO_PUBLIC_API_BASE_URL
    if (direct) return direct
    if (base) return `${base.replace(/\/$/, '')}/api/qa`
    return ''
  }, [])

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert('権限が必要です', '写真へのアクセスを許可してください。')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setImageUri(asset.uri)
      if (asset.base64) {
        const dataUrl = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
        setImageDataUrl(dataUrl)
      }
    }
  }

  const handleSend = async () => {
    if (!input.trim() && !imageDataUrl) {
      Alert.alert('入力エラー', 'メッセージまたは画像を選択してください。')
      return
    }
    if (!endpoint) {
      Alert.alert('設定が必要です', 'QAエンドポイントを環境変数に設定してください。')
      return
    }
    const newMessage: ChatMessage = {
      role: 'user',
      content: input.trim() || '画像について教えてください。',
      imageUri: imageUri || undefined,
      imageDataUrl: imageDataUrl || undefined,
    }
    setMessages((prev) => [...prev, newMessage])
    setInput('')
    setImageUri(null)
    setImageDataUrl(null)
    setLoading(true)
    try {
      const history = messages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .slice(-3)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
          imageUrl: msg.imageDataUrl,
        }))

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: newMessage.content,
          image: newMessage.imageDataUrl,
          history,
        }),
      })

      if (!response.ok) {
        throw new Error('AIの応答に失敗しました')
      }
      const data = await response.json()
      const assistantMessage: ChatMessage = {
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>AI Q&A</Text>
      <View style={styles.card}>
        {messages.length === 0 && (
          <Text style={styles.mutedText}>質問を入力して送信してください。</Text>
        )}
        {messages.map((msg, index) => (
          <View key={`msg-${index}`} style={msg.role === 'user' ? styles.userBubble : styles.aiBubble}>
            {msg.imageUri && (
              <Image source={{ uri: msg.imageUri }} style={styles.previewImage} resizeMode="cover" />
            )}
            <Text style={styles.messageText}>{msg.content}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={input}
          onChangeText={setInput}
          placeholder="質問を入力..."
          multiline
        />
        {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />}
        <View style={styles.row}>
          <Pressable style={styles.outlineButton} onPress={pickImage}>
            <Text style={styles.outlineButtonText}>画像を選ぶ</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={handleSend} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? '送信中...' : '送信'}</Text>
          </Pressable>
        </View>
        {!endpoint && (
          <Text style={styles.hintText}>
            `EXPO_PUBLIC_QA_ENDPOINT` または `EXPO_PUBLIC_API_BASE_URL` を設定してください。
          </Text>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  mutedText: {
    fontSize: 12,
    color: '#6b7280',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
  },
  noteInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#eef2ff',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: '#111827',
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    marginBottom: 8,
  },
  hintText: {
    marginTop: 8,
    fontSize: 11,
    color: '#6b7280',
  },
})
