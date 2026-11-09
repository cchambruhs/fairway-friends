// @polsia:user-owned — private Fairway Friends profile editor.
'use client';

import { ArrowDown, ArrowUp, Disc3, MapPin, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FileUploadField } from '@/components/custom/file-upload-field';
import { PlayerRatingsSummary } from '@/components/custom/player-ratings-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import type { UploadedFile } from '@/lib/contracts/file-upload';
import {
  type PlayerProfileResponse,
  PlayerProfileResponseSchema,
  type SavePlayerProfile,
  SavePlayerProfileSchema,
} from '@/lib/contracts/player-profile';
import { applyServerErrors } from '@/lib/forms';

const EMPTY_FORM: SavePlayerProfile = {
  displayName: '',
  hometown: null,
  homeCourse: null,
  bio: null,
  pdgaNumber: null,
  photoKey: null,
  photoUrl: null,
  favoriteDiscs: [],
};

function profileFormValues(saved: PlayerProfileResponse, accountName: string): SavePlayerProfile {
  if (!saved.profile) return { ...EMPTY_FORM, displayName: accountName };
  return {
    ...saved.profile,
    favoriteDiscs: saved.favoriteDiscs.map(({ manufacturer, mold, plastic, weightGrams }) => ({
      manufacturer,
      mold,
      plastic,
      weightGrams,
    })),
  };
}

function fieldError(message: string | undefined) {
  return message ? <p className="ff-profile-field-error">{message}</p> : null;
}

export function PlayerProfileEditor() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [profileExists, setProfileExists] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SavePlayerProfile>({ defaultValues: EMPTY_FORM });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'favoriteDiscs' });
  const photoUrl = watch('photoUrl');
  const displayName = watch('displayName');

  useEffect(() => {
    let active = true;
    apiFetch('/api/player-profile', { schema: PlayerProfileResponseSchema })
      .then((saved) => {
        if (!active) return;
        setProfileExists(Boolean(saved.profile));
        reset(profileFormValues(saved, session?.user?.name ?? ''));
      })
      .catch(() => {
        if (active) toast.error('Your player profile could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reset, session?.user?.name]);

  function onPhotoUploaded(file: UploadedFile) {
    setValue('photoKey', file.key, { shouldDirty: true });
    setValue('photoUrl', file.url, { shouldDirty: true });
    clearErrors(['photoKey', 'photoUrl']);
  }

  async function saveProfile(values: SavePlayerProfile) {
    const valid = SavePlayerProfileSchema.safeParse(values);
    if (!valid.success) {
      const errorsByField = Object.fromEntries(
        valid.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
      );
      applyServerErrors({ errors: errorsByField }, setError);
      return;
    }

    try {
      const saved = await apiFetch('/api/player-profile', {
        method: 'PUT',
        body: JSON.stringify(valid.data),
        schema: PlayerProfileResponseSchema,
      });
      setProfileExists(true);
      reset(profileFormValues(saved, session?.user?.name ?? ''));
      toast.success('Your player profile is saved.');
    } catch (error) {
      const serverBody = error instanceof Error ? error.cause : null;
      if (applyServerErrors(serverBody, setError)) return;
      toast.error('Your player profile could not be saved. Please try again.');
    }
  }

  if (loading) {
    return (
      <div className="ff-profile-loading" aria-live="polite">
        Loading your player profile…
      </div>
    );
  }

  const photo = photoUrl
    ? { src: photoUrl, alt: `Profile photo of ${displayName || 'player'}` }
    : null;

  return (
    <div className="ff-player-profile">
      <header className="ff-player-profile-heading">
        <p className="ff-player-profile-kicker">PLAYER PROFILE</p>
        <h1>{profileExists ? 'Your player profile' : 'Make it yours.'}</h1>
        <p>
          Add the details you want to keep with your Fairway Friends account. Your profile and disc
          preferences are private to you.
        </p>
      </header>

      <div className="ff-profile-source-note" role="note">
        <ShieldCheck aria-hidden="true" size={18} />
        <p>
          Your profile details are private to your account. The rating and statistics below show
          their source and current availability separately.
        </p>
      </div>

      <PlayerRatingsSummary />

      <form className="ff-profile-form" onSubmit={handleSubmit(saveProfile)} noValidate>
        <section className="ff-profile-section" aria-labelledby="player-details-title">
          <div className="ff-profile-section-heading">
            <span className="ff-profile-section-icon" aria-hidden="true">
              <MapPin size={18} />
            </span>
            <div>
              <p className="ff-profile-section-kicker">THE PLAYER</p>
              <h2 id="player-details-title">Your details</h2>
            </div>
          </div>

          <div className="ff-profile-photo-row">
            <div className="ff-player-photo">
              {photo ? (
                <Image src={photo.src} alt={photo.alt} width={96} height={96} unoptimized />
              ) : (
                <Disc3 aria-hidden="true" size={32} />
              )}
            </div>
            <div className="ff-profile-photo-control">
              <FileUploadField
                label="Profile photo"
                accept="image/jpeg,image/png,image/webp"
                actionLabel="Choose photo"
                hint="JPEG, PNG or WebP"
                onUploaded={onPhotoUploaded}
              />
              {photoUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ff-profile-remove-photo"
                  onClick={() => {
                    setValue('photoKey', null, { shouldDirty: true });
                    setValue('photoUrl', null, { shouldDirty: true });
                  }}
                >
                  Remove photo
                </Button>
              ) : null}
            </div>
          </div>

          <div className="ff-profile-fields">
            <div className="ff-profile-field ff-profile-field-wide">
              <Label htmlFor="player-display-name">Player name</Label>
              <Input
                id="player-display-name"
                autoComplete="name"
                maxLength={60}
                {...register('displayName')}
                aria-invalid={errors.displayName ? true : undefined}
              />
              {fieldError(errors.displayName?.message)}
            </div>
            <div className="ff-profile-field">
              <Label htmlFor="player-hometown">Hometown</Label>
              <Input
                id="player-hometown"
                autoComplete="address-level2"
                maxLength={80}
                placeholder="City, state"
                {...register('hometown')}
              />
              {fieldError(errors.hometown?.message)}
            </div>
            <div className="ff-profile-field">
              <Label htmlFor="player-home-course">Home course</Label>
              <Input id="player-home-course" maxLength={100} {...register('homeCourse')} />
              {fieldError(errors.homeCourse?.message)}
            </div>
            <div className="ff-profile-field ff-profile-field-wide">
              <Label htmlFor="player-pdga-number">
                PDGA number <span>(optional)</span>
              </Label>
              <Input
                id="player-pdga-number"
                maxLength={20}
                aria-describedby="player-pdga-number-help"
                {...register('pdgaNumber')}
              />
              <p id="player-pdga-number-help" className="ff-profile-field-footnote">
                Profile information only. Fairway Friends does not verify this number or use it as
                an official rating.
              </p>
              {fieldError(errors.pdgaNumber?.message)}
            </div>
            <div className="ff-profile-field ff-profile-field-wide">
              <Label htmlFor="player-bio">
                About you <span>(optional)</span>
              </Label>
              <Textarea id="player-bio" rows={4} maxLength={280} {...register('bio')} />
              <div className="ff-profile-field-footnote">
                A short note for your local crew. 280 characters max.
              </div>
              {fieldError(errors.bio?.message)}
            </div>
          </div>
        </section>

        <section className="ff-profile-section" aria-labelledby="favorite-discs-title">
          <div className="ff-profile-section-heading ff-profile-discs-heading">
            <span
              className="ff-profile-section-icon ff-profile-section-icon-gold"
              aria-hidden="true"
            >
              <Disc3 size={18} />
            </span>
            <div>
              <p className="ff-profile-section-kicker">YOUR BAG</p>
              <h2 id="favorite-discs-title">Favorite discs</h2>
              <p>Put your go-to discs in order. Add up to five.</p>
            </div>
            <span className="ff-profile-count">{fields.length} / 5</span>
          </div>

          {fields.length === 0 ? (
            <div className="ff-disc-empty-state">
              <Disc3 aria-hidden="true" size={22} />
              <p>Your ranked favorites will live here.</p>
            </div>
          ) : (
            <ol className="ff-disc-list" aria-label="Favorite discs in ranked order">
              {fields.map((field, index) => (
                <li className="ff-disc-item" key={field.id}>
                  <div className="ff-disc-rank" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <fieldset className="ff-disc-fields">
                    <legend>Rank {index + 1}</legend>
                    <div className="ff-profile-fields">
                      <div className="ff-profile-field">
                        <Label htmlFor={`disc-manufacturer-${field.id}`}>Manufacturer</Label>
                        <Input
                          id={`disc-manufacturer-${field.id}`}
                          maxLength={80}
                          {...register(`favoriteDiscs.${index}.manufacturer`)}
                          aria-invalid={
                            errors.favoriteDiscs?.[index]?.manufacturer ? true : undefined
                          }
                        />
                        {fieldError(errors.favoriteDiscs?.[index]?.manufacturer?.message)}
                      </div>
                      <div className="ff-profile-field">
                        <Label htmlFor={`disc-mold-${field.id}`}>Mold</Label>
                        <Input
                          id={`disc-mold-${field.id}`}
                          maxLength={80}
                          {...register(`favoriteDiscs.${index}.mold`)}
                          aria-invalid={errors.favoriteDiscs?.[index]?.mold ? true : undefined}
                        />
                        {fieldError(errors.favoriteDiscs?.[index]?.mold?.message)}
                      </div>
                      <div className="ff-profile-field">
                        <Label htmlFor={`disc-plastic-${field.id}`}>Plastic</Label>
                        <Input
                          id={`disc-plastic-${field.id}`}
                          maxLength={80}
                          {...register(`favoriteDiscs.${index}.plastic`)}
                          aria-invalid={errors.favoriteDiscs?.[index]?.plastic ? true : undefined}
                        />
                        {fieldError(errors.favoriteDiscs?.[index]?.plastic?.message)}
                      </div>
                      <div className="ff-profile-field">
                        <Label htmlFor={`disc-weight-${field.id}`}>Weight (g)</Label>
                        <Input
                          id={`disc-weight-${field.id}`}
                          type="number"
                          min={100}
                          max={200}
                          step={1}
                          {...register(`favoriteDiscs.${index}.weightGrams`, {
                            valueAsNumber: true,
                          })}
                          aria-invalid={
                            errors.favoriteDiscs?.[index]?.weightGrams ? true : undefined
                          }
                          defaultValue={field.weightGrams === 0 ? '' : field.weightGrams}
                        />
                        {fieldError(errors.favoriteDiscs?.[index]?.weightGrams?.message)}
                      </div>
                    </div>
                  </fieldset>
                  <div className="ff-disc-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Move rank ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Move rank ${index + 1} down`}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove rank ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {fieldError(errors.favoriteDiscs?.message)}
          <Button
            type="button"
            variant="outline"
            className="ff-profile-add-disc"
            onClick={() => {
              append({ manufacturer: '', mold: '', plastic: '', weightGrams: 0 });
              clearErrors('favoriteDiscs');
            }}
            disabled={fields.length >= 5}
          >
            <Plus aria-hidden="true" /> Add a favorite disc
          </Button>
        </section>

        <div className="ff-profile-save-row">
          <p>{isDirty ? 'You have unsaved changes.' : 'Changes stay private to your account.'}</p>
          <Button type="submit" disabled={isSubmitting} className="ff-profile-save-button">
            {isSubmitting ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </div>
  );
}
