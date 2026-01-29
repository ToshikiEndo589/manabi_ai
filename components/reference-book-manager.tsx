'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Plus, X, Book, Video, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReferenceBook } from '@/types/database'

interface ReferenceBookManagerProps {
  referenceBooks: ReferenceBook[]
  selectedBookId: string | null
  onSelect: (bookId: string | null) => void
  onRefresh: () => void
}

export function ReferenceBookManager({
  referenceBooks,
  selectedBookId,
  onSelect,
  onRefresh,
}: ReferenceBookManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [bookName, setBookName] = useState('')
  const [bookImage, setBookImage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setBookImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAddBook = async () => {
    if (!bookName.trim()) {
      alert('教材名を入力してください')
      return
    }

    setIsSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        alert('ログインが必要です')
        return
      }

      // 同じ名前の削除済み教材があるか確認
      const { data: deletedBook } = await supabase
        .from('reference_books')
        .select('*')
        .eq('user_id', user.id)
        .eq('name', bookName.trim())
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // 画像をSupabase Storageにアップロード
      let imageUrl: string | null = null
      if (bookImage) {
        try {
          const file = await dataURLtoFile(bookImage, `${user.id}/${Date.now()}.jpg`)
          const fileName = `${user.id}/${Date.now()}.jpg`
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('reference-books')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            })

          if (uploadError) {
            console.error('Upload error:', uploadError)
            // Storageバケットが存在しない場合は、画像なしで続行
            alert('画像のアップロードに失敗しましたが、教材は追加されます。Storageバケット「reference-books」を作成してください。')
          } else {
            const { data: urlData } = supabase.storage
              .from('reference-books')
              .getPublicUrl(fileName)
            imageUrl = urlData.publicUrl
          }
        } catch (error) {
          console.error('Image upload failed:', error)
          // 画像アップロードに失敗しても参考書は追加できるようにする
        }
      }

      if (deletedBook) {
        // 削除済み教材を復活させる
        const { error } = await supabase
          .from('reference_books')
          .update({
            deleted_at: null,
            image_url: imageUrl || deletedBook.image_url,
            updated_at: new Date().toISOString(),
          })
          .eq('id', deletedBook.id)

        if (error) throw error
      } else {
        // 新規作成
        const { error } = await supabase.from('reference_books').insert({
          user_id: user.id,
          name: bookName,
          image_url: imageUrl,
          type: 'book',
        })

        if (error) throw error
      }

      setBookName('')
      setBookImage(null)
      setShowAddForm(false)
      onRefresh()
    } catch (error: any) {
      alert(error.message || '教材の追加に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  const dataURLtoFile = (dataurl: string, filename: string): Promise<File> => {
    return new Promise((resolve) => {
      const arr = dataurl.split(',')
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
      const bstr = atob(arr[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      resolve(new File([u8arr], filename, { type: mime }))
    })
  }

  const handleDeleteBook = async (bookId: string) => {
    if (!confirm('この教材を削除しますか？学習記録は残ります。再登録すると過去の記録と紐づきます。')) return
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        alert('ログインが必要です')
        return
      }

      // 論理削除（deleted_atを設定）
      const { error } = await supabase
        .from('reference_books')
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookId)

      if (error) throw error

      if (selectedBookId === bookId) {
        onSelect(null)
      }

      onRefresh()
    } catch (error: any) {
      alert(error.message || '教材の削除に失敗しました')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">教材</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="w-4 h-4 mr-2" />
          追加
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <CardTitle className="text-base">新しい教材を追加</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="book_name">名前</Label>
              <Input
                id="book_name"
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
                placeholder="例: チャート式数学I"
              />
            </div>

            <div className="space-y-2">
              <Label>画像（任意）</Label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                >
                  画像を選択
                </Button>
                {bookImage && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBookImage(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {bookImage && (
                <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                  <Image
                    src={bookImage}
                    alt="Preview"
                    fill
                    className="object-cover"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false)
                  setBookName('')
                  setBookImage(null)
                }}
                className="flex-1"
              >
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={handleAddBook}
                disabled={isSaving || !bookName.trim()}
                className="flex-1"
              >
                {isSaving ? '追加中...' : '追加'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {referenceBooks.map((book) => (
          <Card
            key={book.id}
            className={`cursor-pointer transition-all ${
              selectedBookId === book.id
                ? 'border-2 border-blue-500 shadow-lg'
                : 'border hover:border-blue-300'
            }`}
            onClick={() => onSelect(book.id)}
          >
            <CardContent className="pt-3 pb-3 relative flex flex-col items-center text-center sm:items-start sm:text-left">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteBook(book.id)
                }}
                className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-red-600"
                aria-label="参考書を削除"
              >
                <Trash2 className="w-4 h-4" />
              </Button>

              <div className="flex flex-col items-center gap-2 sm:items-start">
                {book.image_url ? (
                  <div className="relative w-14 h-14 flex-shrink-0 rounded overflow-hidden">
                    <Image
                      src={book.image_url}
                      alt={book.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 flex-shrink-0 bg-gray-100 rounded flex items-center justify-center">
                    {book.type === 'book' ? (
                      <Book className="w-8 h-8 text-gray-400" />
                    ) : (
                      <Video className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                )}
                <div className="w-full">
                  <p className="font-semibold text-sm leading-snug break-words">
                    {book.name || '教材'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 hidden sm:block">
                    {book.type === 'book' ? '参考書' : '動画授業'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {referenceBooks.length === 0 && !showAddForm && (
        <div className="text-center py-8 text-muted-foreground">
          <p>参考書が登録されていません</p>
          <p className="text-sm mt-2">「追加」ボタンから参考書を追加してください</p>
        </div>
      )}
    </div>
  )
}
