import React from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export interface PlannerDeleteModalProps {
  visible: boolean;
  onDeleteDay: () => void;
  onDeleteWeek: () => void;
  onExit: () => void;
}

/**
 * Dialog asking the user whether to delete the day plan or the whole week plan.
 */
export const PlannerDeleteModal: React.FC<PlannerDeleteModalProps> = ({
  visible,
  onDeleteDay,
  onDeleteWeek,
  onExit,
}) => {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      visible={visible}
      icon="trash-outline"
      variant="destructive"
      title={t('planner.deleteModal.title')}
      body={t('planner.deleteModal.sub')}
      confirmLabel={t('planner.deleteModal.day')}
      onConfirm={onDeleteDay}
      extraAction={{ label: t('planner.deleteModal.week'), onPress: onDeleteWeek }}
      cancelLabel={t('planner.deleteModal.exit')}
      onCancel={onExit}
    />
  );
};
