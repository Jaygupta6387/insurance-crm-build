import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Car, Heart, Activity, Building2,
  ArrowLeft, ChevronRight, Sparkles,
  ShieldCheck, Zap, TrendingUp, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import MotorPolicyWizard from '@/components/policies/motor/MotorPolicyWizard';
import HealthPolicyWizard from '@/components/policies/health/HealthPolicyWizard';

// ── LOB option definitions ─────────────────────────────────────────────────────
const LOBS = [
  {
    key:         'motor',
    label:       'Motor Insurance',
    shortLabel:  'Motor',
    description: 'Two-wheeler, four-wheeler, commercial vehicles — comprehensive & third-party policies',
    icon:        Car,
    gradient:    'from-blue-500 to-cyan-500',
    lightBg:     'from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30',
    border:      'border-blue-200 dark:border-blue-800',
    iconBg:      'from-blue-500 to-cyan-500',
    accent:      'text-blue-600 dark:text-blue-400',
    badge:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    features:    ['Comprehensive Cover', 'Third Party', 'OD + TP', 'Add-on Riders'],
  },
  {
    key:         'life',
    label:       'Life Insurance',
    shortLabel:  'Life',
    description: 'Term, endowment, ULIP and whole life plans for long-term financial protection',
    icon:        Heart,
    gradient:    'from-rose-500 to-pink-500',
    lightBg:     'from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30',
    border:      'border-rose-200 dark:border-rose-800',
    iconBg:      'from-rose-500 to-pink-500',
    accent:      'text-rose-600 dark:text-rose-400',
    badge:       'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    features:    ['Term Plan', 'Endowment', 'ULIP', 'Whole Life'],
  },
  {
    key:         'health',
    label:       'Health Insurance',
    shortLabel:  'Health',
    description: 'Individual, family floater, critical illness and group health policies',
    icon:        Activity,
    gradient:    'from-emerald-500 to-teal-500',
    lightBg:     'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30',
    border:      'border-emerald-200 dark:border-emerald-800',
    iconBg:      'from-emerald-500 to-teal-500',
    accent:      'text-emerald-600 dark:text-emerald-400',
    badge:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    features:    ['Individual', 'Family Floater', 'Critical Illness', 'Group Health'],
  },
  {
    key:         'sme',
    label:       'SME Insurance',
    shortLabel:  'SME',
    description: 'Fire, burglary, marine, liability and package policies for businesses',
    icon:        Building2,
    gradient:    'from-amber-500 to-orange-500',
    lightBg:     'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30',
    border:      'border-amber-200 dark:border-amber-800',
    iconBg:      'from-amber-500 to-orange-500',
    accent:      'text-amber-600 dark:text-amber-400',
    badge:       'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    features:    ['Fire & Burglary', 'Marine', 'Liability', 'Package Policy'],
  },
] as const;

// ── Animation variants ─────────────────────────────────────────────────────────
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const card = {
  hidden:  { opacity: 0, y: 20, scale: 0.97 },
  show:    { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.35, ease: 'easeOut' } },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function CreatePolicyPage() {
  const { company_slug, lob } = useParams();
  const navigate = useNavigate();

  if (lob === 'motor') {
    return <MotorPolicyWizard />;
  }

  if (lob === 'health') {
    return <HealthPolicyWizard />;
  }

  // Other LOBs are not yet implemented
  if (lob) {
    return (
      <div className="flex h-full flex-col">
        <Header title="New Policy" subtitle="Coming soon">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/${company_slug}/policies/create`)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Header>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-dashed border-border/70 p-10 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h3 className="mt-3 text-lg font-bold text-foreground capitalize">{lob} policies</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This line of business is coming soon. Motor insurance is available now.
            </p>
            <Button className="mt-5" onClick={() => navigate(`/${company_slug}/policies/create/motor`)}>
              Create a Motor Policy
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSelect = (lobKey: string) => {
    navigate(`/${company_slug}/policies/create/${lobKey}`);
  };

  return (
    <div className="flex h-full flex-col">
      <Header title="New Policy" subtitle="Select a line of business to begin">
        <Button variant="ghost" size="sm"
          onClick={() => navigate(`/${company_slug}/policies`)}
          className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Policies
        </Button>
      </Header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Intro banner */}
          <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 p-6 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center shadow-inner shrink-0">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">Choose a Line of Business</h2>
                <p className="text-sm text-white/70 mt-0.5">
                  Select the insurance category that best fits your customer's needs.
                  You can always switch later.
                </p>
              </div>
            </div>
          </div>

          {/* LOB cards */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 gap-5"
          >
            {LOBS.map(lob => {
              const Icon = lob.icon;
              return (
                <motion.div key={lob.key} variants={card}>
                  <button
                    type="button"
                    onClick={() => handleSelect(lob.key)}
                    className={cn(
                      'group w-full text-left rounded-2xl border-2 p-6 transition-all duration-200',
                      'bg-gradient-to-br shadow-sm',
                      'hover:shadow-xl hover:-translate-y-1 hover:scale-[1.01]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      'active:scale-[0.99]',
                      lob.lightBg, lob.border,
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Icon */}
                      <div className={cn(
                        'h-14 w-14 rounded-2xl flex items-center justify-center text-white shrink-0',
                        'shadow-lg bg-gradient-to-br transition-transform duration-200 group-hover:scale-110',
                        lob.iconBg,
                      )}>
                        <Icon className="h-7 w-7" strokeWidth={1.8} />
                      </div>

                      {/* Arrow */}
                      <div className={cn(
                        'h-8 w-8 rounded-xl flex items-center justify-center transition-all duration-200',
                        'opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5',
                        lob.badge,
                      )}>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>

                    {/* Title & description */}
                    <div className="mt-4 mb-4">
                      <h3 className={cn('text-lg font-bold leading-tight', lob.accent)}>
                        {lob.label}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        {lob.description}
                      </p>
                    </div>

                    {/* Feature pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {lob.features.map(f => (
                        <span key={f} className={cn('px-2.5 py-1 rounded-full text-[11px] font-semibold border', lob.badge)}>
                          {f}
                        </span>
                      ))}
                    </div>

                    {/* CTA footer */}
                    <div className={cn(
                      'mt-5 flex items-center gap-2 text-sm font-semibold transition-all duration-200',
                      'opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0',
                      lob.accent,
                    )}>
                      <span>Start {lob.shortLabel} Policy</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Bottom info strip */}
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: ShieldCheck, label: 'Fully Validated',  desc: 'All policy data is validated before submission'   },
                { icon: Zap,         label: 'Instant Issuance', desc: 'Policies processed and tracked in real time'       },
                { icon: Users,       label: 'Client Linked',    desc: 'Automatically linked to your customer record'      },
              ].map(item => {
                const I = item.icon;
                return (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <I className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
