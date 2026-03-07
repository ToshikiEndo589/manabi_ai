import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { useProfile } from '../contexts/ProfileContext'
import type { ReferenceBook } from '../types'
import { formatTimer } from '../lib/format'
import { getTodayStart } from '../lib/date'

export function StudyScreen() {
  const { userId } = useProfile()
  const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [newBookName, setNewBookName] = useState('')
  const [editingBookId, setEditingBookId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [pausedTime, setPausedTime] = useState(0)
  const [currentSeconds, setCurrentSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showBookPicker, setShowBookPicker] = useState(false)
  const [showAddBookForm, setShowAddBookForm] = useState(false)
  const [newBookImage, setNewBookImage] = useState<string | null>(null)


  const selectedBook = useMemo(
    () => referenceBooks.find((book) => book.id === selectedBookId) || null,
    [referenceBooks, selectedBookId]
  )

  const fetchBooks = useCallback(async () => {
    if (!userId) {
      return [] as ReferenceBook[]
    }

    const { data, error } = await supabase
      .from('reference_books')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      return [] as ReferenceBook[]
    }

    return (data || []) as ReferenceBook[]
  }, [userId])

  const loadBooks = useCallback(async () => {
    setLoading(true)
    const books = await fetchBooks()
    setReferenceBooks(books)
    setLoading(false)
  }, [fetchBooks])

  useEffect(() => {
    let isActive = true

    const initialize = async () => {
      setLoading(true)
      const books = await fetchBooks()
      if (!isActive) return

      setReferenceBooks(books)
      setLoading(false)
    }

    void initialize()

    return () => {
      isActive = false
    }
  }, [fetchBooks])

  // Timer update effect - calculate elapsed time from start time
  useEffect(() => {
    if (isRunning && startTime) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        setCurrentSeconds(pausedTime + elapsed)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isRunning, startTime, pausedTime])

  // Persist timer state to AsyncStorage
  useEffect(() => {
    const saveTimer = async () => {
      const TIMER_STORAGE_KEY = `study_timer_${userId}`
      if (isRunning && startTime) {
        await AsyncStorage.setItem(
          TIMER_STORAGE_KEY,
          JSON.stringify({
            isRunning: true,
            startTime,
            pausedTime,
            selectedBookId,
          })
        )
      } else if (!isRunning && currentSeconds === 0) {
        await AsyncStorage.removeItem(TIMER_STORAGE_KEY)
      }
    }
    saveTimer()
  }, [isRunning, startTime, pausedTime, selectedBookId, currentSeconds, userId])

  // Restore timer state on mount
  useEffect(() => {
    const restoreTimer = async () => {
      const TIMER_STORAGE_KEY = `study_timer_${userId}`
      const saved = await AsyncStorage.getItem(TIMER_STORAGE_KEY)
      if (saved) {
        try {
          const {
            isRunning: wasRunning,
            startTime: savedStart,
            pausedTime: savedPaused,
            selectedBookId: savedBook,
          } = JSON.parse(saved)
          if (wasRunning && savedStart) {
            setStartTime(savedStart)
            setPausedTime(savedPaused)
            setIsRunning(true)
            setSelectedBookId(savedBook)
            const elapsed = Math.floor((Date.now() - savedStart) / 1000)
            setCurrentSeconds(savedPaused + elapsed)
          }
        } catch (error) {
          // Invalid saved data, just ignore
          await AsyncStorage.removeItem(TIMER_STORAGE_KEY)
        }
      }
    }
    if (userId) {
      restoreTimer()
    }
  }, [userId])

  const handleAddBook = async () => {
    if (!newBookName.trim()) return
    let imageUrl: string | null = null

    // Only upload if newBookImage is a local URI (starts with file:// or content://)
    // If it's already a http URL, keep it as is unless replaced
    const isLocalImage = newBookImage && !newBookImage.startsWith('http')

    if (isLocalImage && newBookImage) {
      try {
        const response = await fetch(newBookImage)
        const arrayBuffer = await response.arrayBuffer()

        const filePath = `${userId}/${Date.now()}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('reference-books')
          .upload(filePath, arrayBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          Alert.alert('アップロードエラー', uploadError.message)
        } else {
          const { data } = supabase.storage.from('reference-books').getPublicUrl(filePath)
          imageUrl = data.publicUrl
        }
      } catch (_error) {
        Alert.alert('画像のアップロードに失敗しました', '画像なしで保存します。')
      }
    } else if (newBookImage && newBookImage.startsWith('http')) {
      imageUrl = newBookImage
    }

    if (editingBookId) {
      // Update existing book
      const { error, data } = await supabase
        .from('reference_books')
        .update({
          name: newBookName.trim(),
          image_url: imageUrl, // this will be null if image cleared, or new URL, or existing URL if unchanged
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingBookId)
        .select()
        .single()

      if (error) {
        Alert.alert('保存エラー', error.message)
        return
      }

      // 教材名変更を関連テーブルの subject にも反映
      await supabase
        .from('review_materials')
        .update({ subject: newBookName.trim() })
        .eq('reference_book_id', editingBookId)

      await supabase
        .from('study_logs')
        .update({ subject: newBookName.trim() })
        .eq('reference_book_id', editingBookId)

      setReferenceBooks((prev) => prev.map(b => b.id === editingBookId ? (data as ReferenceBook) : b))
      setEditingBookId(null)
    } else {
      // Check for deleted book with same name to restore
      const { data: deletedBook } = await supabase
        .from('reference_books')
        .select('*')
        .eq('user_id', userId)
        .eq('name', newBookName.trim())
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (deletedBook) {
        const { error } = await supabase
          .from('reference_books')
          .update({
            deleted_at: null,
            image_url: imageUrl || deletedBook.image_url,
            updated_at: new Date().toISOString(),
          })
          .eq('id', deletedBook.id)
        if (error) {
          Alert.alert('保存エラー', error.message)
          return
        }
        const restored = {
          ...(deletedBook as ReferenceBook),
          deleted_at: null,
          image_url: imageUrl || deletedBook.image_url,
        }
        setReferenceBooks((prev) => [restored, ...prev])
      } else {
        const { error, data } = await supabase
          .from('reference_books')
          .insert({
            user_id: userId,
            name: newBookName.trim(),
            image_url: imageUrl,
            type: 'book',
          })
          .select()
          .single()
        if (error) {
          Alert.alert('保存エラー', error.message)
          return
        }
        setReferenceBooks((prev) => [data as ReferenceBook, ...prev])
      }
    }

    setNewBookName('')
    setNewBookImage(null)
    setShowAddBookForm(false)
    await loadBooks() // Reload books to reflect the saved image
  }


  const handleDeleteBook = async (bookId: string) => {
    Alert.alert(
      '教材の削除',
      'この教材を削除してもよろしいですか？\n削除した教材は一覧から消えます。',
      [
        {
          text: 'キャンセル',
          style: 'cancel',
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('reference_books')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', bookId)
            if (error) {
              Alert.alert('削除エラー', error.message)
              return
            }
            setReferenceBooks((prev) => prev.filter((book) => book.id !== bookId))
            if (selectedBookId === bookId) setSelectedBookId(null)
            if (editingBookId === bookId) {
              setEditingBookId(null)
              setShowAddBookForm(false)
              setNewBookName('')
              setNewBookImage(null)
            }
          },
        },
      ]
    )
  }
  const handleStart = () => {
    if (!selectedBookId) {
      Alert.alert('教材を選択してください')
      return
    }
    if (currentSeconds > 0) {
      // Resume: continue from where we left off (do NOT reset pausedTime)
      setStartTime(Date.now())
      setIsRunning(true)
    } else {
      // Fresh start
      setStartTime(Date.now())
      setPausedTime(0)
      setCurrentSeconds(0)
      setIsRunning(true)
    }
  }

  const handlePause = () => {
    if (startTime) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setPausedTime(pausedTime + elapsed)
      setCurrentSeconds(pausedTime + elapsed)
    }
    setStartTime(null)
    setIsRunning(false)
  }

  const handleStop = async () => {
    setIsRunning(false)

    // Calculate final elapsed time
    let finalSeconds = currentSeconds
    if (startTime) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      finalSeconds = pausedTime + elapsed
    }

    if (finalSeconds < 60) {
      setStartTime(null)
      setPausedTime(0)
      setCurrentSeconds(0)
      const TIMER_STORAGE_KEY = `study_timer_${userId}`
      await AsyncStorage.removeItem(TIMER_STORAGE_KEY)
      Alert.alert('1分以上の学習時間を記録してください')
      return
    }
    if (!selectedBookId) {
      Alert.alert('教材を選択してください')
      setStartTime(null)
      setPausedTime(0)
      setCurrentSeconds(0)
      const TIMER_STORAGE_KEY = `study_timer_${userId}`
      await AsyncStorage.removeItem(TIMER_STORAGE_KEY)
      return
    }
    const minutes = Math.floor(finalSeconds / 60)
    const subject = selectedBook?.name?.trim() || 'その他'
    // 今日の学習日開始時刻（午前3時UTC）を記録時刻とする
    const startedAt = getTodayStart()
    const startedAtISO = startedAt.toISOString()
    const { data, error } = await supabase
      .from('study_logs')
      .insert({
        user_id: userId,
        subject,
        reference_book_id: selectedBook?.id || null,
        study_minutes: minutes,
        started_at: startedAtISO,
        note: null,
      })
      .select()
      .single()
    if (error) {
      Alert.alert('保存エラー', error.message)
      return
    }
    const messages = [
      `🎉 ${subject}を${minutes}分学習したね！素晴らしい！`,
      `✨ ${minutes}分の学習、お疲れ様！合格に一歩近づいたよ！`,
      `💪 ${subject}を${minutes}分頑張ったね！この調子で続けよう！`,
      `🔥 ${minutes}分の学習を記録したよ！連続記録を更新しよう！`,
    ]
    setSuccessMessage(messages[Math.floor(Math.random() * messages.length)])

    // Reset timer state
    setStartTime(null)
    setPausedTime(0)
    setCurrentSeconds(0)
    const TIMER_STORAGE_KEY = `study_timer_${userId}`
    await AsyncStorage.removeItem(TIMER_STORAGE_KEY)
  }

  const getEncouragementMessage = () => {
    const minutes = Math.floor(currentSeconds / 60)
    if (minutes === 0) return '🚀 学習を始めよう！一緒に頑張るよ！'
    if (minutes < 30) return `💪 ${minutes}分経過！この調子で続けよう！`
    if (minutes < 60) return `✨ ${minutes}分頑張ってるね！素晴らしい集中力だよ！`
    return `🔥 ${Math.floor(minutes / 60)}時間以上！本当に頑張ってるね！`
  }



  const pickBookImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert('権限が必要です', '写真へのアクセスを許可してください。')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, // Forces JPEG/PNG conversation
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      setNewBookImage(result.assets[0].uri)
    }
  }



  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>教材選択</Text>
          <Text style={styles.cardSubtitle}>学習する教材を選択してください</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.mutedText}>{selectedBook ? selectedBook.name : '教材が未選択です'}</Text>
            <Pressable style={styles.outlineButton} onPress={() => setShowBookPicker((prev) => !prev)}>
              <Text style={styles.outlineButtonText}>{showBookPicker ? '閉じる' : '教材を選ぶ'}</Text>
            </Pressable>
          </View>
          {showBookPicker && (
            <View style={styles.bookPickerArea}>
              <View style={styles.bookHeaderRow}>
                <Text style={styles.bookHeaderText}>教材</Text>
                <Pressable style={styles.addChipButton} onPress={() => setShowAddBookForm((prev) => !prev)}>
                  <Ionicons name="add" size={16} color="#334155" />
                  <Text style={styles.addChipText}>追加</Text>
                </Pressable>
              </View>
              {showAddBookForm && (
                <View style={styles.addCard}>
                  <Text style={styles.addCardTitle}>{editingBookId ? '教材を編集' : '新しい教材を追加'}</Text>
                  <Text style={styles.label}>名前</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="例: チャート式数学I"
                    value={newBookName}
                    onChangeText={setNewBookName}
                  />
                  <Text style={styles.label}>画像（任意）</Text>
                  <Pressable style={styles.imageSelectButton} onPress={pickBookImage}>
                    {newBookImage ? (
                      <Image source={{ uri: newBookImage }} style={{ width: 100, height: 100, borderRadius: 8 }} />
                    ) : (
                      <Text style={styles.imageSelectText}>画像を選択</Text>
                    )}
                  </Pressable>
                  <View style={styles.row}>
                    <Pressable
                      style={[styles.outlineButton, styles.flex]}
                      onPress={() => {
                        setShowAddBookForm(false)
                        setNewBookName('')
                        setNewBookImage(null)
                        setEditingBookId(null)
                      }}
                    >
                      <Text style={styles.outlineButtonText}>キャンセル</Text>
                    </Pressable>
                    <Pressable style={[styles.primaryButton, styles.flex]} onPress={handleAddBook}>
                      <Text style={styles.primaryButtonText}>{editingBookId ? '保存' : '追加'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {loading ? (
                <Text style={styles.mutedText}>読み込み中...</Text>
              ) : (
                <View style={styles.bookGrid}>
                  {referenceBooks.map((book) => (
                    <View
                      key={book.id}
                      style={[
                        styles.bookCard,
                        selectedBookId === book.id && styles.bookCardActive,
                      ]}
                    >
                      <View style={styles.cardActionRow}>
                        <Pressable style={styles.iconButton} onPress={() => {
                          setEditingBookId(book.id)
                          setNewBookName(book.name)
                          setNewBookImage(book.image_url)
                          setShowAddBookForm(true)
                        }}>
                          <Ionicons name="create-outline" size={16} color="#64748b" />
                        </Pressable>
                        <Pressable style={styles.iconButton} onPress={() => handleDeleteBook(book.id)}>
                          <Ionicons name="trash-outline" size={16} color="#64748b" />
                        </Pressable>
                      </View>
                      <Pressable
                        style={styles.bookSelectArea}
                        onPress={() => {
                          if (isRunning) {
                            Alert.alert('計測中は教材を変更できません')
                            return
                          }
                          setSelectedBookId(book.id)
                        }}
                      >
                        <View style={styles.bookImageBox}>
                          {book.image_url ? (
                            <Image source={{ uri: book.image_url }} style={styles.bookImage} />
                          ) : (
                            <Ionicons name="book-outline" size={32} color="#94a3b8" />
                          )}
                        </View>
                        <Text style={styles.bookCardText}>{book.name}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {successMessage && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}
        {isRunning && currentSeconds > 0 && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>{getEncouragementMessage()}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>ストップウォッチ</Text>
          <View style={styles.timerContainer}>
            <Text style={styles.timer}>{formatTimer(currentSeconds)}</Text>
            {selectedBook && !isRunning && currentSeconds === 0 && (
              <Text style={styles.readyText}>{selectedBook.name}を学習予定</Text>
            )}
            {!selectedBookId && (
              <Text style={styles.warningText}>まずは教材を選択してください</Text>
            )}
          </View>

          {!isRunning ? (
            <Pressable
              style={[styles.mainStartButton, !selectedBookId && styles.disabledStartButton]}
              onPress={handleStart}
              disabled={!selectedBookId}
            >
              <Ionicons name="play" size={24} color={selectedBookId ? '#ffffff' : '#94a3b8'} />
              <Text style={[styles.mainStartText, !selectedBookId && styles.disabledStartText]}>
                {currentSeconds > 0 ? '再開' : 'スタート'}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.activeControls}>
              <Pressable style={styles.pauseCircleButton} onPress={handlePause}>
                <Ionicons name="pause" size={28} color="#f59e0b" />
                <Text style={styles.pauseCircleText}>一時停止</Text>
              </Pressable>

              <Pressable style={styles.stopCircleButton} onPress={handleStop}>
                <Ionicons name="stop" size={28} color="#ef4444" />
                <Text style={styles.stopCircleText}>終了・保存</Text>
              </Pressable>
            </View>
          )}
        </View>


      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    padding: 24,
    backgroundColor: '#ffffff',
    gap: 40,
    paddingBottom: 60,
  },
  card: {
    gap: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteHeader: {
    marginTop: 4,
    gap: 4,
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  noteHelper: {
    fontSize: 11,
    color: '#64748b',
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  modeButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  noteRow: {
    position: 'relative',
    marginTop: 8,
  },
  noteField: {
    paddingRight: 36,
  },
  noteDeleteButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  toggleAnswerButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  toggleAnswerText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '600',
  },
  answerInput: {
    marginTop: 8,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
  },
  flashcardInputCard: {
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  flashcardInputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flashcardInputTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
  },
  flashcardInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  flashcardQuestionInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  flashcardAnswerInput: {
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
  },
  addNoteButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
  },
  addNoteText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 12,
  },
  bookPickerArea: {
    gap: 8,
    marginTop: 8,
  },
  bookHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bookHeaderText: {
    fontSize: 16,
    fontWeight: '700',
  },
  addChipButton: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addChipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  addCard: {
    borderWidth: 2,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  addCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginTop: 4,
  },
  imageSelectButton: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  imageSelectText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bookCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  bookCardActive: {
    borderColor: '#2563eb',
    shadowColor: '#93c5fd',
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  bookSelectArea: {
    alignItems: 'center',
    gap: 8,
  },
  bookImageBox: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bookImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  bookCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  cardActionRow: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  trashButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    zIndex: 2,
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 12,
  },
  mutedText: {
    fontSize: 12,
    color: '#64748b',
  },
  timerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  timer: {
    fontSize: 72,
    fontWeight: '300',
    color: '#0f172a',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  readyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '700',
  },
  warningText: {
    marginTop: 12,
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '700',
  },
  mainStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 18,
    borderRadius: 999,
    gap: 8,
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  disabledStartButton: {
    backgroundColor: '#f1f5f9',
    shadowOpacity: 0,
    elevation: 0,
  },
  mainStartText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  disabledStartText: {
    color: '#94a3b8',
  },
  activeControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginTop: 8,
  },
  pauseCircleButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  pauseCircleText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
  },
  stopCircleButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  stopCircleText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
  },
  successCard: {
    backgroundColor: '#ecfdf3',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  successText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '600',
  },

})
