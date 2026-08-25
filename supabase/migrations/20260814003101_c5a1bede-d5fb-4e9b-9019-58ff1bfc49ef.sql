CREATE POLICY "servico_fotos_storage_select" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'servico-fotos');
CREATE POLICY "servico_fotos_storage_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'servico-fotos');
CREATE POLICY "servico_fotos_storage_update" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'servico-fotos') WITH CHECK (bucket_id = 'servico-fotos');
CREATE POLICY "servico_fotos_storage_delete" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'servico-fotos');