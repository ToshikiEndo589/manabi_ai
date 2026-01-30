import React, { useEffect, useState } from 'react'
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
import { useProfile } from '../contexts/ProfileContext'
import { supabase } from '../lib/supabase'

export function SettingsScreen() {
  const { profile, updateProfile, userId } = useProfile()
  const [weekdayTarget, setWeekdayTarget] = useState('60')
  const [weekendTarget, setWeekendTarget] = useState('120')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (profile) {
      setWeekdayTarget(String(profile.weekday_target_minutes ?? 60))
      setWeekendTarget(String(profile.weekend_target_minutes ?? 120))
      setAvatarUrl(profile.avatar_url ?? null)
    }
  }, [profile])

  const handleUpdate = async () => {
    setLoading(true)
    try {
      await updateProfile({
        weekday_target_minutes: Number(weekdayTarget),
        weekend_target_minutes: Number(weekendTarget),
      })
      Alert.alert('更新完了', '設定を更新しました。')
    } catch (error: any) {
      Alert.alert('更新エラー', error?.message ?? '更新に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert('権限が必要です', '写真へのアクセスを許可してください。')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    setIsUploading(true)
    try {
      const response = await fetch(asset.uri)
      const blob = await response.blob()
      const fileExt = asset.uri.split('.').pop() || 'jpg'
      const filePath = `${userId}/${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, blob, {
        cacheControl: '3600',
        upsert: true,
      })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const publicUrl = data.publicUrl
      await updateProfile({ avatar_url: publicUrl })
      setAvatarUrl(publicUrl)
      Alert.alert('更新完了', 'アイコンを更新しました。')
    } catch (err: any) {
      Alert.alert('アップロード失敗', err.message || '画像のアップロードに失敗しました。')
    } finally {
      setIsUploading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>設定</Text>
          <Text style={styles.cardSubtitle}>学習目標を更新できます</Text>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarPlaceholder}>?</Text>
              )}
            </View>
            <Pressable style={styles.outlineButton} onPress={handlePickAvatar} disabled={isUploading}>
              <Text style={styles.outlineButtonText}>{isUploading ? 'アップロード中...' : 'アイコンを変更'}</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>正方形の画像がきれいに表示されます</Text>
          <Text style={styles.label}>平日の目標学習時間（分）</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={weekdayTarget}
            onChangeText={setWeekdayTarget}
          />
          <Text style={styles.label}>土日祝の目標学習時間（分）</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={weekendTarget}
            onChangeText={setWeekendTarget}
          />
          <Pressable style={styles.primaryButton} onPress={handleUpdate} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? '更新中...' : '設定を更新'}</Text>
          </Pressable>
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>ログアウト</Text>
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
    padding: 16,
    backgroundColor: '#f1f5fb',
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 64,
    height: 64,
    resizeMode: 'cover',
  },
  avatarPlaceholder: {
    color: '#94a3b8',
    fontSize: 22,
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
  },
  outlineButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  helperText: {
    marginTop: 8,
    fontSize: 11,
    color: '#64748b',
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
    paddingVertical: 8,
    fontSize: 14,
    marginTop: 4,
    backgroundColor: '#f8fafc',
  },
  primaryButton: {
    backgroundColor: '#0b79bf',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#e11d48',
    borderRadius: 12,
    marginTop: 8,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '600',
  },
})
