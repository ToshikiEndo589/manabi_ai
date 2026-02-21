import React, { useEffect, useState } from 'react'
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Modal,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useProfile } from '../contexts/ProfileContext'
import type { ReviewMaterial, ReferenceBook } from '../types'
import { Ionicons } from '@expo/vector-icons'
import { getNextDueDate } from '../lib/sm2'

export function FlashcardScreen() {
    const { userId } = useProfile()
    const [materials, setMaterials] = useState<ReviewMaterial[]>([])
    const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])
    const [loading, setLoading] = useState(true)

    // Creation/Edit states
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingCardId, setEditingCardId] = useState<string | null>(null)

    const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
    const [subjectInput, setSubjectInput] = useState('')
    const [contentInput, setContentInput] = useState('')
    const [selectedDate, setSelectedDate] = useState(new Date())

    // Book picker
    const [showBookPicker, setShowBookPicker] = useState(false)

    useEffect(() => {
        loadData()
    }, [userId])

    const loadData = async () => {
        setLoading(true)

        // Load Books
        const { data: booksData } = await supabase
            .from('reference_books')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })

        if (booksData) {
            setReferenceBooks(booksData as ReferenceBook[])
        }

        // Load Materials
        const { data: materialsData, error } = await supabase
            .from('review_materials')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error(error)
            Alert.alert('エラー', '単語帳データの読み込みに失敗しました。')
        } else {
            setMaterials(materialsData as ReviewMaterial[])
        }

        setLoading(false)
    }

    const openCreateModal = () => {
        setEditingCardId(null)
        setSelectedBookId(null)
        setSubjectInput('')
        setContentInput('')
        setSelectedDate(new Date())
        setShowCreateModal(true)
    }

    const openEditModal = (material: ReviewMaterial) => {
        setEditingCardId(material.id)
        setSelectedBookId(material.reference_book_id)
        setSubjectInput(material.subject)
        setContentInput(material.content)
        setSelectedDate(material.created_at ? new Date(material.created_at) : new Date())
        setShowCreateModal(true)
    }

    const saveCard = async () => {
        if (!contentInput.trim()) {
            Alert.alert('エラー', '内容を入力してください')
            return
        }

        const book = referenceBooks.find((b) => b.id === selectedBookId)
        const finalSubject = book ? book.name : (subjectInput.trim() || 'その他')

        setLoading(true)

        if (editingCardId) {
            // Update existing
            const { error } = await supabase
                .from('review_materials')
                .update({
                    reference_book_id: selectedBookId || null,
                    subject: finalSubject,
                    content: contentInput.trim(),
                })
                .eq('id', editingCardId)

            if (error) {
                Alert.alert('更新エラー', error.message)
            } else {
                Alert.alert('成功', '単語カードを更新しました。')
                setShowCreateModal(false)
                loadData()
            }
        } else {
            // Create new
            const { data, error } = await supabase
                .from('review_materials')
                .insert({
                    user_id: userId,
                    reference_book_id: selectedBookId || null,
                    subject: finalSubject,
                    content: contentInput.trim(),
                })
                .select()
                .single()

            if (error) {
                Alert.alert('作成エラー', error.message)
            } else if (data?.id) {
                // SM-2: 最初の復習は1日後のタスクを1つだけ作成
                const dueDate = getNextDueDate(1)
                const { error: taskError } = await supabase.from('review_tasks').insert({
                    user_id: userId,
                    review_material_id: data.id,
                    due_at: dueDate.toISOString(),
                    status: 'pending',
                })
                if (taskError) {
                    console.error(taskError)
                    Alert.alert('タスク作成エラー', '復習スケジュール設定に失敗しました')
                }

                Alert.alert('成功', '新しい単語カードを作成しました！')
                setShowCreateModal(false)
                loadData()
            }
        }
        setLoading(false)
    }

    const deleteCard = (id: string) => {
        Alert.alert(
            '削除確認',
            'この単語カードを削除しますか？紐づく復習スケジュールも削除されます。',
            [
                { text: 'キャンセル', style: 'cancel' },
                {
                    text: '削除',
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase.from('review_materials').delete().eq('id', id)
                        if (error) {
                            Alert.alert('エラー', '削除に失敗しました')
                        } else {
                            setMaterials(prev => prev.filter(m => m.id !== id))
                        }
                    }
                }
            ]
        )
    }

    if (loading && materials.length === 0) {
        return (
            <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        )
    }

    return (
        <View style={styles.screen}>
            <View style={styles.header}>
                <Text style={styles.title}>単語帳・メモ一覧</Text>
                <Pressable style={styles.addButton} onPress={openCreateModal}>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addButtonText}>追加</Text>
                </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.listContainer}>
                {materials.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="library-outline" size={48} color="#cbd5e1" />
                        <Text style={styles.emptyStateText}>単語カードがありません。</Text>
                        <Text style={styles.emptyStateSubtext}>右上の「追加」ボタンから作成できます。</Text>
                    </View>
                ) : (
                    materials.map((material) => (
                        <View key={material.id} style={styles.card}>
                            <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
                                <View style={styles.row}>
                                    <Ionicons name="book-outline" size={16} color="#64748b" />
                                    <Text style={styles.subjectText}>{material.subject}</Text>
                                </View>
                                <View style={styles.row}>
                                    <Pressable onPress={() => openEditModal(material)} style={{ padding: 4 }}>
                                        <Ionicons name="pencil" size={18} color="#64748b" />
                                    </Pressable>
                                    <Pressable onPress={() => deleteCard(material.id)} style={{ padding: 4, marginLeft: 8 }}>
                                        <Ionicons name="trash" size={18} color="#ef4444" />
                                    </Pressable>
                                </View>
                            </View>
                            <Text style={styles.contentText}>{material.content}</Text>
                        </View>
                    ))
                )}
            </ScrollView>

            {/* CREATE/EDIT MODAL */}
            <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreateModal(false)}>
                <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{editingCardId ? '単語カードを編集' : '単語カードを作成'}</Text>
                        <Pressable onPress={() => setShowCreateModal(false)}>
                            <Text style={styles.cancelText}>キャンセル</Text>
                        </Pressable>
                    </View>

                    <ScrollView style={styles.modalBody}>
                        <Text style={styles.label}>教材・科目</Text>
                        <View style={styles.bookPickerContainer}>
                            <Pressable style={styles.bookPickerButton} onPress={() => setShowBookPicker(!showBookPicker)}>
                                <Text style={[styles.bookPickerText, !selectedBookId && { color: '#94a3b8' }]}>
                                    {selectedBookId ? referenceBooks.find(b => b.id === selectedBookId)?.name : '教材を選択 (任意)'}
                                </Text>
                                <Ionicons name={showBookPicker ? "chevron-up" : "chevron-down"} size={20} color="#64748b" />
                            </Pressable>

                            {showBookPicker && (
                                <View style={styles.bookList}>
                                    <Pressable
                                        style={[styles.bookOption, selectedBookId === null && styles.bookOptionSelected]}
                                        onPress={() => {
                                            setSelectedBookId(null)
                                            setShowBookPicker(false)
                                        }}
                                    >
                                        <Text style={[styles.bookOptionText, selectedBookId === null && styles.bookOptionTextSelected]}>
                                            教材なし (科目を手入力)
                                        </Text>
                                    </Pressable>
                                    {referenceBooks.map((book) => (
                                        <Pressable
                                            key={book.id}
                                            style={[styles.bookOption, selectedBookId === book.id && styles.bookOptionSelected]}
                                            onPress={() => {
                                                setSelectedBookId(book.id)
                                                setShowBookPicker(false)
                                            }}
                                        >
                                            <Text style={[styles.bookOptionText, selectedBookId === book.id && styles.bookOptionTextSelected]}>
                                                {book.name}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        </View>

                        {!selectedBookId && (
                            <TextInput
                                style={styles.input}
                                placeholder="例: 英語、数学"
                                value={subjectInput}
                                onChangeText={setSubjectInput}
                            />
                        )}

                        <Text style={[styles.label, { marginTop: 16 }]}>内容・メモ</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            placeholder="例: apple : りんご"
                            value={contentInput}
                            onChangeText={setContentInput}
                            multiline
                            textAlignVertical="top"
                        />

                        <Pressable style={styles.primaryButton} onPress={saveCard} disabled={loading}>
                            <Text style={styles.primaryButtonText}>{loading ? '保存中...' : '保存'}</Text>
                        </Pressable>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0f172a',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2563eb',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 4,
    },
    addButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    listContainer: {
        padding: 16,
        gap: 12,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyStateText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#64748b',
        marginTop: 16,
    },
    emptyStateSubtext: {
        fontSize: 14,
        color: '#94a3b8',
        marginTop: 4,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    subjectText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
    },
    contentText: {
        fontSize: 15,
        color: '#334155',
        lineHeight: 22,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    cancelText: {
        fontSize: 16,
        color: '#64748b',
    },
    modalBody: {
        padding: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#0f172a',
    },
    textArea: {
        minHeight: 120,
    },
    bookPickerContainer: {
        marginBottom: 8,
    },
    bookPickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
    },
    bookPickerText: {
        fontSize: 16,
        color: '#0f172a',
    },
    bookList: {
        marginTop: 4,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        overflow: 'hidden',
    },
    bookOption: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    bookOptionSelected: {
        backgroundColor: '#eff6ff',
    },
    bookOptionText: {
        fontSize: 15,
        color: '#334155',
    },
    bookOptionTextSelected: {
        color: '#2563eb',
        fontWeight: '600',
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 24,
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
})
