import React, { useState } from 'react'
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
import { supabase } from '../lib/supabase'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mascot = `${(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ai-yobikou.vercel.app').replace(/\/$/, '')}/images/mascot.png`

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください。')
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        Alert.alert('確認メール送信', 'メールを確認してサインインしてください。')
      }
    } catch (error: any) {
      setError(error?.message ?? 'ログインに失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.mascotWrap}>
          <Image source={{ uri: mascot }} style={styles.mascot} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{mode === 'signin' ? 'ログイン' : '新規登録'}</Text>
          <Text style={styles.cardSubtitle}>
            {mode === 'signin' ? 'まなびAIへようこそ' : 'アカウントを作成して学習を始めましょう'}
          </Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Text style={styles.label}>メールアドレス</Text>
          <TextInput
            style={styles.input}
            placeholder="example@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>パスワード</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
            <Text style={styles.primaryButtonText}>
              {loading ? '処理中...' : mode === 'signin' ? 'ログイン' : '新規登録'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.linkButton}
            onPress={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
            }}
            disabled={loading}
          >
            <Text style={styles.linkText}>
              {mode === 'signin' ? '新規登録はこちら' : '既にアカウントをお持ちの方はこちら'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#eff6ff',
  },
  mascotWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  mascot: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: '#475569',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#2563eb',
    fontSize: 14,
  },
  errorText: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
    marginTop: 12,
    marginBottom: 4,
  },
})
