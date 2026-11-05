import { supabase } from './supabase'

export interface SiteBannerItem { id: string; message: string; active: boolean; position: number }

/** Messages affichés dans le bandeau du site, dans l'ordre configuré. */
export async function fetchActiveBanners(): Promise<SiteBannerItem[]> {
  const { data, error } = await supabase.from('site_banners')
    .select('id,message,active,position').eq('active', true).order('position')
  if (error) throw error
  return (data ?? []) as SiteBannerItem[]
}

/** Tous les messages, affichés ou non (administration). */
export async function fetchAllBanners(): Promise<SiteBannerItem[]> {
  const { data, error } = await supabase.from('site_banners')
    .select('id,message,active,position').order('position')
  if (error) throw error
  return (data ?? []) as SiteBannerItem[]
}

export async function saveBanner(b: { id?: string; message: string; active: boolean; position: number }): Promise<string> {
  const { data, error } = await supabase.rpc('save_site_banner', {
    p_id: b.id ?? null, p_message: b.message, p_active: b.active, p_position: b.position,
  })
  if (error) throw error
  return String(data)
}
